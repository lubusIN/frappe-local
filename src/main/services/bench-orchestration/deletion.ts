import { execPromise, getBinaryPath } from '@frappe-local/main/utils';
import { errorMessage } from '@frappe-local/shared/core';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { ensureRuntimeRunning, getRuntimeEnv } from '../runtime-service';
import { getTaskRunner } from '../task-runner';
import type { Bench, Site } from '@frappe-local/shared/domain';
import { IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS, TASK_CANCELLABLE_AFTER_MS, QUICK_MAX_TIMEOUT_MS } from '@frappe-local/main/constants';
import { benchComposeArgs, cleanupPodmanResources, getBenchComposePath, getComposeProjectName, nameFilterArgs, projectFilterArgs } from '@frappe-local/main/utils/podman';

export const orchestrateBenchDeletion = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null>, delete: (id: string) => Promise<boolean> },
  sitesRepo: { findAll: () => Promise<Site[]>, delete: (id: string) => Promise<boolean> },
  options?: {
    onDeleted?: (bench: Bench) => Promise<void> | void;
  }
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Delete Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    cancellable: false,
    cancellableAfterMs: TASK_CANCELLABLE_AFTER_MS,
    run: async (context) => {
      const removeBenchDirectoryBestEffort = async () => {
        context.startStep('fs', 'Removing bench directory');
        try {
          if (fs.existsSync(bench.path)) {
            context.log('info', `Removing directory: ${bench.path}`, 'fs');
            try {
              await fs.promises.rm(bench.path, { recursive: true, force: true });
            } catch (err: unknown) {
              if (process.platform === 'win32' && err instanceof Error && 'code' in err && err.code === 'EPERM') {
                context.log('warning', `Node fs.rm failed with EPERM, falling back to native rmdir...`, 'fs');
                await new Promise<void>((resolve, reject) => {
                  const child = spawn('cmd.exe', ['/c', 'rmdir', '/s', '/q', bench.path], { windowsHide: true });
                  child.on('close', (code: number) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Native rmdir failed with code ${code}`));
                  });
                });
              } else {
                throw err;
              }
            }
          }
          context.completeStep('fs', 'Bench directory removed');
        } catch (fsErr) {
          context.log('warning', `Could not remove directory: ${errorMessage(fsErr)}`);
          context.completeStep('fs', 'Bench directory removal skipped');
        }
      };

      try {
        // Set status to queued so the UI knows to poll for updates
        await benchesRepo.update(bench.id, { status: 'queued' });

        context.startStep('runtime', 'Checking podman status');
        const runtimeReady = await ensureRuntimeRunning((msg) => context.log('info', msg, 'runtime'));
        if (runtimeReady) {
          context.completeStep('runtime', 'Podman is ready');
        } else {
          context.log('warning', 'Podman is not running and could not be started automatically. Continuing with local force deletion.');
          context.completeStep('runtime', 'Podman unavailable; skipping container cleanup');
        }

        context.startStep('deleting', 'Deleting...');
        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const args = [...benchComposeArgs(projectName, getBenchComposePath(bench.path)), 'down', '-v', '--remove-orphans'];
        context.log('info', `Running: ${command} ${args.join(' ')}`, 'deleting');

        if (!runtimeReady) {
          context.completeStep('deleting', 'Docker cleanup skipped (runtime unavailable)');
        } else {
          let runtimeEnv = await getRuntimeEnv();
          const podmanCommand = getBinaryPath('podman');

          const runProjectCleanup = async () => {
            await cleanupPodmanResources(
              podmanCommand,
              projectFilterArgs(projectName),
              runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS },
              { info: (msg) => context.log('info', msg, 'deleting'), warn: (msg) => context.log('warning', msg, 'deleting') }
            );
          };

          try {
            const { code, stderr } = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'deleting'), runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS });
            if (code !== 0) {
              throw new Error(`Docker cleanup failed with code ${code}: ${stderr}`);
            }
            await runProjectCleanup();
            context.completeStep('deleting', 'Docker cleanup finished');
          } catch (err) {
            const message = errorMessage(err);
            const daemonUnavailable = message.includes('Cannot connect to the Docker daemon');

            if (daemonUnavailable) {
              context.log('warning', 'Docker daemon is unavailable. Attempting to start podman and retry cleanup once.');
              const runtimeRecovered = await ensureRuntimeRunning((msg) => context.log('info', msg, 'runtime'));
              if (runtimeRecovered) {
                runtimeEnv = await getRuntimeEnv();
                try {
                  const retryResult = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'deleting'), runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS });
                  if (retryResult.code === 0) {
                    await runProjectCleanup();
                    context.completeStep('deleting', 'Docker cleanup finished after runtime recovery');
                  } else {
                    context.log('warning', `Docker cleanup retry failed with code ${retryResult.code}: ${retryResult.stderr}`);
                    context.completeStep('deleting', 'Docker cleanup skipped after retry failure');
                  }
                } catch (retryErr) {
                  context.log('warning', `Docker cleanup retry failed: ${errorMessage(retryErr)}`);
                  context.completeStep('deleting', 'Docker cleanup skipped after retry failure');
                }
              } else {
                context.log('warning', 'Podman could not be started for cleanup retry. Continuing with local force deletion.');
                context.completeStep('deleting', 'Docker cleanup skipped (runtime unavailable)');
              }
            } else {
              context.log('warning', `Docker cleanup skipped: ${message}`);
              context.completeStep('deleting', 'Docker cleanup skipped');
            }
          }
        }

        context.startStep('db', 'Removing database records');

        // Remove sites
        const allSites = await sitesRepo.findAll();
        const attachedSites = allSites.filter(s => s.benchId === bench.id);
        for (const site of attachedSites) {
          context.log('info', `Deleting site record: ${site.name}`);
          await sitesRepo.delete(site.id);
        }

        // Remove bench
        await benchesRepo.delete(bench.id);
        context.completeStep('db', 'Database records removed');

        await removeBenchDirectoryBestEffort();

        if (options?.onDeleted) {
          try {
            await options.onDeleted(bench);
          } catch (error) {
            context.log('warning', `Post-delete bench cleanup failed: ${errorMessage(error)}`);
          }
        }
      } catch (error) {
        await removeBenchDirectoryBestEffort();
        context.log('error', `Force deletion failed: ${errorMessage(error)}`);
        await benchesRepo.update(bench.id, { status: bench.status });
        throw error;
      }
    }
  });
};

export const resetAllBenchContainers = async (
  benches: Bench[],
  runtimeEnv: NodeJS.ProcessEnv,
  logger: { warn: (msg: string) => void }
): Promise<void> => {
  const composeBinary = getBinaryPath('docker-compose');

  for (const bench of benches) {
    const projectName = getComposeProjectName(bench.id);
    try {
      await execPromise(
        composeBinary,
        ['-p', projectName, 'down', '-v', '--remove-orphans'],
        bench.path,
        undefined,
        runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
      );
    } catch (error) {
      logger.warn(`Failed to clean compose project ${projectName}: ${error}`);
    }
  }

  // Clean up any orphaned podman resources matching the frappe-local prefix
  const podmanBinary = getBinaryPath('podman');
  await cleanupPodmanResources(
    podmanBinary,
    nameFilterArgs('frappe-local-'),
    runtimeEnv,
    { idleTimeout: QUICK_MAX_TIMEOUT_MS },
    { info: () => { }, warn: (msg) => logger.warn(msg) }
  );
};
