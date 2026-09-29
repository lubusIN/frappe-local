import { DEFAULT_HTTP_PORT, execPromise, getBinaryPath } from '@frappe-local/main/utils';
import { errorMessage } from '@frappe-local/shared/core';
import fs from 'node:fs';
import { ensureRuntimeRunning, getRuntimeEnv, getLastRuntimeError } from '../runtime-service';
import { getTaskRunner, type TaskExecutionContext } from '../task-runner';
import type { Bench, CustomAppItem } from '@frappe-local/shared/domain';
import { IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS, TASK_CANCELLABLE_AFTER_MS } from '@frappe-local/main/constants';
import { benchComposeArgs, ensureBenchComposeWritten, getBenchComposePath, getComposeProjectName } from '@frappe-local/main/utils/podman';
import { resolveAndPersistBenchPort, ensureBenchProcfile, ensureBenchDevcontainer, ensureBenchSocketioPort, getLocalAppVolumes, restartBenchProcesses } from './utils';

/**
 * Wait for bench containers to be fully running natively.
 * Does not spawn a TaskRunner task or restart the containers.
 */
export const waitForBenchContainers = async (bench: Bench): Promise<void> => {
  const CORE_BENCH_SERVICES = ['frappe'] as const;

  const parseRunningServices = (stdout: string): Set<string> => {
    return new Set(
      stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  };

  const hasCoreBenchServicesRunning = (runningServices: Set<string>): boolean => {
    return CORE_BENCH_SERVICES.every((service) => runningServices.has(service));
  };

  if (!bench.path || !fs.existsSync(bench.path)) {
    return;
  }

  const command = getBinaryPath('docker-compose');
  const projectName = getComposeProjectName(bench.id);
  const composePath = getBenchComposePath(bench.path);
  const commonArgs = benchComposeArgs(projectName, composePath);
  
  try {
    const runtimeEnv = await getRuntimeEnv();
    const maxAttempts = 30; // 30 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const psResult = await execPromise(
          command,
          [...commonArgs, 'ps', '--services', '--status', 'running'],
          bench.path,
          undefined,
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        
        const runningServices = parseRunningServices(psResult.stdout);
        if (hasCoreBenchServicesRunning(runningServices)) {
          // Containers are up, but since the frappe container runs 'sleep infinity',
          // we must ensure the bench processes are actually running.
          try {
            await restartBenchProcesses({
              projectName,
              benchPath: bench.path,
              runtimeCmd: command,
              runtimeEnv
            });
          } catch {
            // Ignore if it fails, it might just be starting up
          }
          return;
        }
      } catch {
        // Ignore execution errors and keep polling
      }
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch {
    // runtimeEnv failed or something else
  }
};

const cleanupFailedBenchStartOrStop = async (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  context: TaskExecutionContext,
  stepId: string
) => {
  try {
    if (!context.signal.aborted) {
      context.startStep(stepId, 'Forcefully stopping bench to ensure clean state');
    }
    const command = getBinaryPath('docker-compose');
    const projectName = getComposeProjectName(bench.id);
    const runtimeEnv = await getRuntimeEnv();

    await execPromise(
      command,
      ['-p', projectName, 'down', '--remove-orphans', '--timeout', '5'],
      bench.path,
      context.signal.aborted ? undefined : (out) => context.log('info', out, stepId),
      runtimeEnv,
      { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS, signal: null }
    );
    await benchesRepo.update(bench.id, { status: 'stopped' });
    if (!context.signal.aborted) {
      context.completeStep(stepId, 'Bench forcefully stopped');
    }
  } catch (error) {
    if (!context.signal.aborted) {
      context.log('error', `Failed to forcefully stop bench: ${errorMessage(error)}`, stepId);
    }
  }
};

export const orchestrateBenchStart = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  customAppsRepo?: { findAll?: () => Promise<CustomAppItem[]> },
  shareSshKeys: boolean = false,
  isRestart = false
): string => {
  const taskRunner = getTaskRunner();

  const CORE_BENCH_SERVICES = ['frappe'] as const;

  const parseRunningServices = (stdout: string): Set<string> => {
    return new Set(
      stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  };

  const hasCoreBenchServicesRunning = (runningServices: Set<string>): boolean => {
    return CORE_BENCH_SERVICES.every((service) => runningServices.has(service));
  };

  return taskRunner.enqueue({
    name: isRestart ? `Restart Bench ${bench.name}` : `Start Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    cancellable: false,
    cancellableAfterMs: TASK_CANCELLABLE_AFTER_MS,
    onCancel: async (context) => {
      context.log('info', 'Cancelling start operation...', 'start');
      await cleanupFailedBenchStartOrStop(bench, benchesRepo, context, 'rollback-start');
    },
    run: async (context) => {
      try {
        // Precondition checks
        context.startStep('validation', 'Validating bench configuration');

        if (!bench.path) {
          throw new Error(`Bench path is not configured for ${bench.name}`);
        }

        if (!fs.existsSync(bench.path)) {
          throw new Error(`Bench directory does not exist at ${bench.path}. Please check the path or delete and recreate the bench.`);
        }

        context.completeStep('validation', 'Bench configuration valid');

        context.log('info', `Orchestrating ${isRestart ? 'restart' : 'start'} for bench ${bench.name} (${bench.id})`);

        context.startStep('runtime', 'Checking podman status');
        const isRuntimeReady = await ensureRuntimeRunning((msg) => context.log('info', msg, 'runtime'));
        if (!isRuntimeReady) {
          throw new Error(
            getLastRuntimeError() ||
            'Podman is not running and could not be started automatically.'
          );
        }
        context.completeStep('runtime', 'Podman is ready');

        context.startStep('env', 'Generating docker-compose configuration');
        const benchWithPort = await resolveAndPersistBenchPort(bench, benchesRepo, context, !isRestart);
        const localVolumes = await getLocalAppVolumes(bench.apps, customAppsRepo);
        context.log('info', `Configuring HTTP port: ${benchWithPort.httpPort ?? DEFAULT_HTTP_PORT}`, 'env');
        if (localVolumes.length > 0) {
          context.log('info', `Mounting ${localVolumes.length} custom app volume(s) into containers`, 'env');
        }
        ensureBenchComposeWritten(bench.path, bench.frappeVersion, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, shareSshKeys, localVolumes);
        if (process.platform !== 'win32') {
          await ensureBenchSocketioPort(bench.path, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, context, 'env');
          await ensureBenchProcfile(bench.path, context, 'env');
        }
        await ensureBenchDevcontainer(bench.path, context, 'env', undefined, bench.id);
        context.log('info', `Wrote docker-compose.yml for Frappe ${bench.frappeVersion}`, 'env');
        context.completeStep('env', `Compose generated (HTTP port ${benchWithPort.httpPort})`);

        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const composePath = getBenchComposePath(bench.path);
        const commonArgs = benchComposeArgs(projectName, composePath);
        const runtimeEnv = await getRuntimeEnv();

        if (!isRestart) {
          context.startStep('pull', 'Checking for image updates');
          await execPromise(command, [...commonArgs, 'pull'], bench.path, (out) => context.log('info', out, 'pull'), runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS });
          context.completeStep('pull', 'Images updated');
        }

        context.startStep('start', isRestart ? 'Restarting containers' : 'Starting containers');
        const upArgs = [
          ...commonArgs,
          'up', '-d',
          '--force-recreate',
          '--remove-orphans'
        ];

        context.log('info', `Running: ${command} ${upArgs.join(' ')}`);

        let upResult: Awaited<ReturnType<typeof execPromise>> | null = null;
        try {
          upResult = await execPromise(
            command,
            upArgs,
            bench.path,
            (out) => context.log('info', out, 'start'),
            runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
          );
        } catch (error) {
          const message = errorMessage(error);
          if (!message.includes('Command timed out')) {
            throw error;
          }

          context.log(
            'warning',
            `${isRestart ? 'Restart' : 'Start'} timed out while waiting for compose output. Verifying running services...`,
            'start'
          );

          const psResult = await execPromise(
            command,
            [...commonArgs, 'ps', '--services', '--status', 'running'],
            bench.path,
            (out) => context.log('info', out, 'start'),
            runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
          );

          const runningServices = parseRunningServices(psResult.stdout);
          if (hasCoreBenchServicesRunning(runningServices)) {
            context.log(
              'warning',
              'Compose timed out, but core services are running. Marking operation as successful.',
              'start'
            );
            context.log(
              'info',
              `${isRestart ? 'Restart' : 'Start'} finalized from running service health check fallback.`,
              'start'
            );
            upResult = { code: 0, stdout: psResult.stdout, stderr: psResult.stderr };
          } else {
            throw new Error(
              `${isRestart ? 'Restart' : 'Start'} timed out and core services did not come up. Running services: ${Array.from(runningServices).join(', ') || 'none'}`
            );
          }
        }

        if (upResult.code !== 0) {
          throw new Error(`Command failed with code ${upResult.code}: ${upResult.stderr}`);
        }

        if (process.platform === 'win32') {
          const containerEnv = { projectName, runtimeCmd: command, runtimeEnv };
          await ensureBenchSocketioPort(bench.path, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, context, 'env', containerEnv);
          await ensureBenchProcfile(bench.path, context, 'env', containerEnv);
        }
        context.completeStep('start', 'Containers are running');

        await restartBenchProcesses({
          projectName,
          benchPath: bench.path,
          runtimeCmd: command,
          runtimeEnv
        }, context);
        await benchesRepo.update(bench.id, { status: 'running' });
      } catch (error) {
        context.log('error', errorMessage(error));
        await benchesRepo.update(bench.id, {
          status: bench.status === 'running' ? 'running' : 'stopped',
        });
        throw error;
      }
    }
  });
};

/**
 * Shuts down a running bench gracefully using docker-compose down.
 */
export const orchestrateBenchStop = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> }
): void => {
  const taskRunner = getTaskRunner();

  const isBenignStopState = (stdout: string, stderr: string): boolean => {
    const combined = `${stdout}\n${stderr}`.toLowerCase();
    return (
      combined.includes('no containers to stop') ||
      combined.includes('is not running') ||
      combined.includes('no such container') ||
      combined.includes('cannot connect to the docker daemon') ||
      combined.includes('no such service')
    );
  };

  taskRunner.enqueue({
    name: `Stop Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    cancellable: false,
    cancellableAfterMs: TASK_CANCELLABLE_AFTER_MS,
    onCancel: async (context) => {
      context.log('info', 'Cancelling stop operation...', 'stop');
      await cleanupFailedBenchStartOrStop(bench, benchesRepo, context, 'rollback-stop');
    },
    run: async (context) => {
      try {
        await benchesRepo.update(bench.id, { status: 'queued' });

        context.startStep('stop', 'Stopping bench containers');
        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const args = ['-p', projectName, 'stop', '--timeout', '20'];
        const runtimeEnv = await getRuntimeEnv();

        let result: Awaited<ReturnType<typeof execPromise>> | null = null;
        try {
          result = await execPromise(
            command,
            args,
            bench.path,
            (out) => context.log('info', out, 'stop'),
            runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
          );
        } catch (error) {
          const message = errorMessage(error);
          if (!message.includes('Command timed out')) {
            throw error;
          }

          context.log('warning', `Bench stop timed out once. Falling back to docker-compose down: ${bench.name}`, 'stop');
          result = await execPromise(
            command,
            ['-p', projectName, 'down', '--remove-orphans', '--timeout', '20'],
            bench.path,
            (out) => context.log('info', out, 'stop'),
            runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
          );
        }

        if (result.code !== 0 && !isBenignStopState(result.stdout, result.stderr)) {
          throw new Error(`Command failed: ${result.stderr}`);
        }

        if (result.code !== 0) {
          context.log('warning', `Bench ${bench.name} was already stopped. Continuing.`, 'stop');
        }

        context.completeStep('stop', 'Containers stopped successfully');
        await benchesRepo.update(bench.id, { status: 'stopped' });
      } catch (error) {
        await benchesRepo.update(bench.id, { status: bench.status });
        throw error;
      }
    }
  });
};
