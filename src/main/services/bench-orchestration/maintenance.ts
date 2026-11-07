import { execPromise, getBinaryPath } from '@frappe-local/main/utils';
import { errorMessage } from '@frappe-local/shared/core';
import path from 'node:path';
import fs from 'node:fs';
import { ensureRuntimeRunning, getRuntimeEnv } from '../runtime-service';
import { getTaskRunner } from '../task-runner';
import type { Bench, Site } from '@frappe-local/shared/domain';
import { DATABASE_CREDENTIALS, IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS, TASK_CANCELLABLE_AFTER_MS, QUICK_IDLE_TIMEOUT_MS, QUICK_MAX_TIMEOUT_MS } from '@frappe-local/main/constants';
import { composeBenchArgs, composeExecArgs, getComposeProjectName } from '@frappe-local/main/utils/podman';

export const orchestrateBenchBuild = (bench: Bench): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Build Bench: ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    cancellable: false,
    cancellableAfterMs: TASK_CANCELLABLE_AFTER_MS,
    onCancel: async (context) => {
      context.log('info', 'Cancelling build operation...', 'build');
    },
    run: async (context) => {
      try {
        context.startStep('runtime', 'Ensuring container runtime is available');
        await ensureRuntimeRunning((msg) => context.log('info', msg, 'runtime'));
        context.completeStep('runtime', 'Container runtime is ready');

        context.startStep('build', 'Running bench build');
        const projectName = getComposeProjectName(bench.id);
        const args = composeBenchArgs(projectName, ['build']);

        const command = getBinaryPath('docker-compose');
        const runtimeEnv = await getRuntimeEnv();

        const result = await execPromise(
          command,
          args,
          bench.path,
          (out: string) => context.log('info', out, 'build'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );

        if (result.code !== 0) {
          throw new Error(`Command failed with exit code ${result.code}: ${result.stderr}`);
        }
      } catch (error) {
        context.log('error', `Build failed: ${errorMessage(error)}`);
        throw error;
      }
    },
  });
};

export const orchestrateBenchCleaning = (
  bench: Bench,
  sitesRepo: { findAll: () => Promise<Site[]>, delete: (id: string) => Promise<boolean> }
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Clean Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    cancellable: false,
    cancellableAfterMs: TASK_CANCELLABLE_AFTER_MS,
    run: async (context) => {
      try {
        context.startStep('scan', 'Scanning for sites');

        // 1. Get sites from DB
        let allSites = await sitesRepo.findAll();
        const dbSites = allSites.filter(s => s.benchId === bench.id).map(s => s.name);
        const runtimeCmd = getBinaryPath('docker-compose');
        const runtimeEnv = await getRuntimeEnv();
        const projectName = getComposeProjectName(bench.id);

        // 2. Get sites from Disk
        let diskSites: string[] = [];
        const sitesPath = path.join(bench.path, 'sites');
        if (process.platform === 'win32') {
          const listResult = await execPromise(
            runtimeCmd,
            composeExecArgs(projectName, 'frappe', ['find', 'sites', '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '-printf', '%f\n']),
            bench.path,
            undefined,
            runtimeEnv,
            { idleTimeout: QUICK_IDLE_TIMEOUT_MS, maxTimeout: QUICK_MAX_TIMEOUT_MS }
          );
          if (listResult.code === 0) {
            diskSites = listResult.stdout.split(/\r?\n/).map((name) => name.trim()).filter((name) => name && !['assets', 'languages'].includes(name));
          } else {
            context.log('warning', `Could not scan container workspace sites: ${listResult.stderr || listResult.stdout}`);
          }
        } else if (fs.existsSync(sitesPath)) {
          const entries = fs.readdirSync(sitesPath, { withFileTypes: true });
          diskSites = entries
            .filter((e) => e.isDirectory() && !['assets', 'languages'].includes(e.name))
            .map((e) => e.name);
        } else {
          context.log('info', 'Sites directory not found on disk, skipping disk scan');
        }

        // Unique set of sites to clean
        let sitesToClean = Array.from(new Set([...dbSites, ...diskSites]));

        context.log('info', `Found ${sitesToClean.length} total sites to clean (${dbSites.length} in DB, ${diskSites.length} on disk)`);
        context.completeStep('scan', `Found ${sitesToClean.length} sites`);

        // Re-verify bench state before proceeding with cleanup to avoid race conditions
        context.startStep('verify', 'Verifying bench consistency');
        const updatedSites = await sitesRepo.findAll();
        const reVerifyDbSites = updatedSites.filter(s => s.benchId === bench.id).map(s => s.name);

        // Check if new sites were added during scan
        const newSitesAdded = reVerifyDbSites.filter(s => !dbSites.includes(s));
        if (newSitesAdded.length > 0) {
          context.log('warning', `New sites detected during verification: ${newSitesAdded.join(', ')}. Adding to cleanup list.`);
          sitesToClean = Array.from(new Set([...sitesToClean, ...newSitesAdded]));
        }
        context.completeStep('verify', 'Bench consistency verified');

        const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;

        // Refresh sites list for cleanup operations
        allSites = await sitesRepo.findAll();

        for (const siteName of sitesToClean) {
          context.startStep('drop', `Dropping site ${siteName}`);

          const args = composeBenchArgs(projectName, [
            'drop-site',
            '--no-backup',
            '--db-root-username', DATABASE_CREDENTIALS.DB_ROOT_USERNAME,
            '--db-root-password', dbPassword,
            '--force',
            siteName
          ]);

          try {
            // Only try to run bench command if the bench is running and site directory exists on disk
            // (or if we want to try anyway and ignore failure)
            const { code, stderr } = await execPromise(runtimeCmd, args, bench.path, (out) => context.log('info', out, 'drop'), runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS });
            if (code !== 0) {
              context.log('warning', `Bench command failed for ${siteName} (it might not exist on disk): ${stderr}`);
            }
          } catch (err) {
            context.log('error', `Error dropping site ${siteName}: ${errorMessage(err)}`);
          }

          // Cleanup from DB
          const registeredSite = allSites.find(s => s.name === siteName && s.benchId === bench.id);
          if (registeredSite) {
            await sitesRepo.delete(registeredSite.id);
            context.log('info', `Deleted site record: ${siteName}`);
          }

          context.completeStep('drop', `Finished cleaning ${siteName}`);
        }

        context.log('info', 'Bench cleaning completed successfully');
      } catch (error) {
        context.log('error', `Bench cleaning failed: ${errorMessage(error)}`);
        throw error;
      }
    }
  });
};

/**
 * Fully removes a bench from the system.
 * Drops all attached sites, removes containers and volumes, deletes the
 * bench directory from the filesystem, and removes the database records.
 */
