import { DEFAULT_HTTP_PORT, execPromise, getBinaryPath } from '@frappe-local/main/utils';
import { errorMessage, filterNonCoreApps, humanizeCreateFailure, isLikelyOutOfMemory } from '@frappe-local/shared/core';
import path from 'node:path';
import fs from 'node:fs';
import { ensureRuntimeRunning, getRuntimeEnv, getLastRuntimeError } from '../runtime-service';
import { getTaskRunner, type TaskExecutionContext } from '../task-runner';
import type { AppCatalogItem, Bench, CustomAppItem, Site } from '@frappe-local/shared/domain';
import { IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS } from '@frappe-local/main/constants';
import { benchComposeArgs, composeBenchArgs, ensureBenchComposeWritten, getBenchComposePath, getComposeProjectName } from '@frappe-local/main/utils/podman';
import { orchestrateSiteCreation } from '../site-orchestration';
import { resolveAndPersistBenchPort, resolveBenchBranch, cleanupBenchAppArtifacts, ensureBenchProcfile, ensureBenchDevcontainer, ensureBenchSocketioPort, getLocalAppVolumes } from './utils';
import { fetchBenchApps } from './apps';

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
