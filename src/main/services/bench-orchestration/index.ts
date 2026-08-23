import { DEFAULT_HTTP_PORT, execPromise, getBinaryPath } from '@frappe-local/main/utils';
import { errorMessage, filterNonCoreApps, humanizeCreateFailure, isLikelyOutOfMemory } from '@frappe-local/shared/core';

import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { ensureRuntimeRunning, getRuntimeEnv, getLastRuntimeError } from '../runtime-service';
import { getTaskRunner, type TaskExecutionContext } from '../task-runner';
import type { AppCatalogItem, Bench, CustomAppItem, Site } from '@frappe-local/shared/domain';

import { DATABASE_CREDENTIALS, IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS, TASK_CANCELLABLE_AFTER_MS, QUICK_IDLE_TIMEOUT_MS, QUICK_MAX_TIMEOUT_MS } from '@frappe-local/main/constants';

import { benchComposeArgs, cleanupPodmanResources, composeBenchArgs, composeExecArgs, ensureBenchComposeWritten, getBenchComposePath, getComposeProjectName, nameFilterArgs, projectFilterArgs } from '@frappe-local/main/utils/podman';
import { orchestrateSiteCreation } from '../site-orchestration';

import {
  resolveAndPersistBenchPort,
  resolveBenchBranch,
  resolveCatalogBranch,
  cleanupBenchAppArtifacts,
  ensureBenchProcfile,
  ensureBenchDevcontainer,
  getFirstBenchSiteName,
  ensureBenchSocketioPort,
  normalizeBenchApps,
  getLocalAppVolumes,
  getAppDelta,
  restartBenchProcesses
} from './utils';

export {
  resolveAndPersistBenchPort,
  resolveBenchBranch,
  resolveCatalogBranch,
  cleanupBenchAppArtifacts,
  ensureBenchProcfile,
  ensureBenchDevcontainer,
  getFirstBenchSiteName,
  ensureBenchSocketioPort,
  normalizeBenchApps,
  getLocalAppVolumes,
  getAppDelta,
  restartBenchProcesses
};

import { fetchBenchApps, orchestrateBenchAppChanges } from './apps';
export { fetchBenchApps, orchestrateBenchAppChanges };

export const orchestrateBenchCreation = (
  bench: Bench,
  benchesRepo: {
    update: (id: string, payload: Partial<Bench>) => Promise<Bench | null>;
    delete?: (id: string) => Promise<boolean>;
    findById: (id: string) => Promise<Bench | null>;
  },
  appCatalogRepo?: {
    findById?: (id: string) => Promise<AppCatalogItem | null>;
  },
  customAppsRepo?: {
    findAll?: () => Promise<CustomAppItem[]>;
  },
  shareSshKeys: boolean = false,
  siteCreationOptions?: {
    siteName: string;
    siteRepo: {
      create: (input: {
        name: string;
        benchId: string;
        apps: string[];
        status: 'queued' | 'ready' | 'failure';
        path: string;
      }) => Promise<Site>;
      update: (id: string, input: { status?: 'queued' | 'ready' | 'failure' }) => Promise<Site | null>;
      delete?: (id: string) => Promise<boolean>;
    };
    onCompleted?: () => Promise<void>;
  }
): void => {
  const taskRunner = getTaskRunner();

  let attemptedCreateAppInstalls: string[] = [];
  let runtimeReadyForCleanup = false;

  const cleanupFailedBenchCreate = async (context: TaskExecutionContext) => {
    try {
      context.startStep('cleanup', 'Cleaning up partial bench resources');

      if (attemptedCreateAppInstalls.length > 0) {
        await cleanupBenchAppArtifacts(bench.path, attemptedCreateAppInstalls, context, 'cleanup');
      }

      if (runtimeReadyForCleanup) {
        const runtimeEnv = await getRuntimeEnv();
        await execPromise(
          getBinaryPath('docker-compose'),
          ['-p', getComposeProjectName(bench.id), 'down', '-v', '--remove-orphans'],
          bench.path,
          (out) => context.log('info', out, 'cleanup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS, signal: null }
        );
      } else {
        context.log('warning', 'Runtime setup did not complete. Skipping container cleanup.', 'cleanup');
      }

      if (fs.existsSync(bench.path)) {
        try {
          await fs.promises.rm(bench.path, { recursive: true, force: true });
          context.log('info', `Deleted bench directory at ${bench.path}`, 'cleanup');
        } catch (rmError) {
          context.log('warning', `Failed to delete bench directory: ${errorMessage(rmError)}`, 'cleanup');
        }
      }

      context.completeStep('cleanup', 'Partial resources cleaned up');
    } catch (cleanupError) {
      context.log('warning', `Cleanup after failed create did not complete: ${errorMessage(cleanupError)}`, 'cleanup');
    }

    if (benchesRepo.delete) {
      await benchesRepo.delete(bench.id);
      context.log('warning', 'Removed failed bench record after create failure.', 'cleanup');
    } else {
      await benchesRepo.update(bench.id, { status: 'failure' });
    }
  };

  taskRunner.enqueue({
    name: `Create Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    onCancel: async (context) => {
      context.log('info', `Rolling back incomplete bench creation...`, 'rollback');
      await cleanupFailedBenchCreate(context);
    },
    run: async (context) => {
      let failingStepId = 'start';
      try {
        await benchesRepo.update(bench.id, { status: 'queued' });

        failingStepId = 'runtime';
        context.startStep('runtime', `Checking podman status`);
        const isRuntimeReady = await ensureRuntimeRunning((msg) => context.log('info', msg, 'runtime'));
        if (!isRuntimeReady) {
          throw new Error(
            getLastRuntimeError() ||
            'Podman is not running and could not be started automatically. Please start it manually.'
          );
        }
        runtimeReadyForCleanup = true;
        context.completeStep('runtime', `Podman is ready`);

        // The host directory stores compose/devcontainer metadata. Bench itself is
        // initialized in the mounted workspace (a named volume on Windows).
        context.startStep('init', `Initializing bench directory at ${bench.path}`);
        if (!fs.existsSync(bench.path)) {
          context.log('info', `Creating directory: ${bench.path}`, 'init');
          fs.mkdirSync(bench.path, { recursive: true });
        } else {
          context.log('info', `Using existing directory: ${bench.path}`, 'init');
        }
        context.completeStep('init', 'Bench directory initialized');

        context.startStep('env', 'Generating docker-compose configuration');
        const benchWithPort = await resolveAndPersistBenchPort(bench, benchesRepo, context, true);
        const localVolumes = await getLocalAppVolumes(bench.apps ?? [], customAppsRepo);
        context.log('info', `Configuring HTTP port: ${benchWithPort.httpPort ?? DEFAULT_HTTP_PORT}`, 'env');
        if (localVolumes.length > 0) {
          context.log('info', `Mounting ${localVolumes.length} custom app volume(s) into containers`, 'env');
        }
        ensureBenchComposeWritten(bench.path, bench.frappeVersion, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, shareSshKeys, localVolumes);
        context.log('info', `Wrote docker-compose.yml for Frappe ${bench.frappeVersion}`, 'env');
        context.completeStep('env', `Compose generated (HTTP port ${benchWithPort.httpPort})`);

        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const composePath = getBenchComposePath(bench.path);
        const commonArgs = benchComposeArgs(projectName, composePath);
        const runtimeEnv = await getRuntimeEnv();

        context.startStep('pull', 'Pulling images');
        failingStepId = 'pull';
        await execPromise(command, [...commonArgs, 'pull'], bench.path, (out) => context.log('info', out, 'pull'), runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS });
        context.completeStep('pull', 'Images pulled');

        context.startStep('start', 'Starting bench containers');
        failingStepId = 'start';
        const upArgs = [...commonArgs, 'up', '-d', '--remove-orphans'];
        const { code, stderr, stdout } = await execPromise(
          command,
          upArgs,
          bench.path,
          (out) => context.log('info', out, 'start'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );

        if (code !== 0) {
          const combinedOutput = `${stdout}\n${stderr}`;
          const failure = code === 137 || isLikelyOutOfMemory(combinedOutput)
            ? humanizeCreateFailure('bench', `code ${code}: ${combinedOutput}`)
            : `Command failed with code ${code}: ${stderr}`;
          throw new Error(failure);
        }

        context.completeStep('start', 'Containers started');

        context.startStep('setup', 'Setting up Frappe bench');
        failingStepId = 'setup';
        const branch = resolveBenchBranch(bench.frappeVersion);
        const initArgs = composeBenchArgs(projectName, ['init', '--frappe-branch', branch, '--skip-redis-config-generation', '--ignore-exist', '.']);
        const initResult = await execPromise(
          command,
          initArgs,
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        if (initResult.code !== 0) {
          throw new Error(`bench init failed with exit code ${initResult.code}. Check logs for details.`);
        }

        // Configure redis services
        await execPromise(
          command,
          composeBenchArgs(projectName, ['set-config', '-g', 'db_host', 'mariadb']),
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        await execPromise(
          command,
          composeBenchArgs(projectName, ['set-config', '-g', 'redis_cache', 'redis://redis:6379']),
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        await execPromise(
          command,
          composeBenchArgs(projectName, ['set-config', '-g', 'redis_queue', 'redis://redis:6379']),
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        await execPromise(
          command,
          composeBenchArgs(projectName, ['set-config', '-g', 'redis_socketio', 'redis://redis:6379']),
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );

        // Bind web server and socketio to 0.0.0.0 so they are accessible from the host
        await execPromise(
          command,
          composeBenchArgs(projectName, ['set-config', '-g', 'host', '0.0.0.0']),
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );

        // Enable developer mode so that Werkzeug serves static assets correctly
        await execPromise(
          command,
          composeBenchArgs(projectName, ['set-config', '-g', 'developer_mode', '1']),
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );

        // Some app frontends import this key at build time. The value keeps browser
        // socket traffic on the Caddy HTTPS front door, which proxies /socket.io.
        const containerEnv = { projectName, runtimeCmd: command, runtimeEnv };
        await ensureBenchSocketioPort(bench.path, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, context, 'setup', containerEnv);
        await ensureBenchProcfile(bench.path, context, 'setup', containerEnv);
        await ensureBenchDevcontainer(bench.path, context, 'setup', undefined, bench.id);

        context.completeStep('setup', 'Bench initialized and configured');

        const appsToInstall = filterNonCoreApps(
          (bench.apps ?? []).map((app) => app.trim()).filter(Boolean)
        );

        let finalApps = bench.apps ?? [];
        if (appsToInstall.length > 0) {
          failingStepId = 'apps';
          finalApps = await fetchBenchApps(context, {
            stepId: 'apps',
            stepStartDesc: `Adding ${appsToInstall.length} app${appsToInstall.length === 1 ? '' : 's'} to bench`,
            stepCompleteDesc: 'Selected apps added to bench',
            apps: appsToInstall,
            bench,
            appCatalogRepo,
            customAppsRepo,
            projectName,
            runtimeCmd: command,
            runtimeEnv,
            onAttemptedInstall: (app) => {
              attemptedCreateAppInstalls = [...attemptedCreateAppInstalls, app];
            }
          });
        }

        context.startStep('run', 'Starting bench processes');
        failingStepId = 'run';
        await execPromise(
          command,
          [...commonArgs, 'exec', '-d', 'frappe', 'sh', '-c', 'nohup honcho start > logs/honcho.log 2>&1'],
          bench.path,
          (out) => context.log('info', out, 'run'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        context.completeStep('run', 'Bench processes started');

        await benchesRepo.update(bench.id, { status: 'running', apps: finalApps });

        if (siteCreationOptions && siteCreationOptions.siteName) {
          context.startStep('site-queue', `Queueing initial site creation for ${siteCreationOptions.siteName}`);

          try {
            await orchestrateSiteCreation(
              {
                sites: siteCreationOptions.siteRepo,
                benches: benchesRepo,
                customApps: customAppsRepo
              },
              {
                name: siteCreationOptions.siteName,
                benchId: bench.id,
                path: path.join(bench.path, 'sites', siteCreationOptions.siteName),
                apps: [],
              },
              {
                onCompleted: siteCreationOptions.onCompleted,
              }
            );
            context.completeStep('site-queue', 'Site creation task queued');
          } catch (siteError) {
            context.log('warning', `Failed to queue initial site: ${errorMessage(siteError)}`, 'site-queue');
          }
        }
      } catch (error) {
        const rawMessage = errorMessage(error);
        const message = humanizeCreateFailure('bench', rawMessage);
        context.log('error', message, failingStepId);

        if (isLikelyOutOfMemory(rawMessage)) {
          context.log(
            'warning',
            'Detected probable out-of-memory condition. Increase Podman machine memory and retry.',
            'start'
          );
        }

        await cleanupFailedBenchCreate(context);

        throw new Error(message);
      }
    }
  });
};

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

/**
 * Orchestrates fetching, installing, or building apps against an existing bench.
 * Used when adding or updating apps after bench creation.
 */
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
