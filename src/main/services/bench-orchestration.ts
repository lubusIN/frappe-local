import { execPromise } from '../utils/exec';
import { errorMessage } from '../../shared/core/utils';
import { getBinaryPath } from '../utils/binaries';
import path from 'node:path';
import fs from 'node:fs';
import { getTaskRunner, type TaskExecutionContext } from './task-runner';
import type { Bench, Site } from '../../shared/domain/models';
import { ensureRuntimeRunning, getRuntimeEnv } from './runtime-service';
import { DATABASE_CREDENTIALS, OPERATION_TIMEOUTS } from '../constants';
import { findNextAvailableTcpPort, isTcpPortFree } from '../utils/ports';
import { humanizeCreateFailure, isLikelyOutOfMemory } from '../../shared/core/runtime-errors';
import { CORE_BENCH_APPS_SET } from '../../shared/utils/bench-apps';
import { ensureBenchComposeWritten, getBenchComposePath } from '../utils/podman/bench-compose';
import { benchComposeArgs, getComposeProjectName, composeBenchArgs } from '../utils/podman/compose-args';
import { cleanupPodmanResources, projectFilterArgs, nameFilterArgs } from '../utils/podman/podman-cleanup';
import type { AppCatalogItem } from '../../shared/domain/models';
import { getDefaultAppCatalogSeed } from './catalog-provider';
import { DEFAULT_HTTP_PORT } from '../utils/bench-http-port';

const DEFAULT_CATALOG_BY_APP_ID = new Map(getDefaultAppCatalogSeed().map((item) => [item.id, item]));

const resolveAndPersistBenchPort = async (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  allowPortShift: boolean
): Promise<Bench> => {
  const preferredPort = bench.httpPort ?? DEFAULT_HTTP_PORT;

  if (!allowPortShift) {
    return { ...bench, httpPort: preferredPort };
  }

  const isPreferredPortFree = await isTcpPortFree(preferredPort);
  if (isPreferredPortFree) {
    if (bench.httpPort !== preferredPort) {
      const updated = await benchesRepo.update(bench.id, { httpPort: preferredPort });
      return updated ?? { ...bench, httpPort: preferredPort };
    }
    return { ...bench, httpPort: preferredPort };
  }

  const nextPort = await findNextAvailableTcpPort(preferredPort + 1);
  context.log('warning', `HTTP port ${preferredPort} is busy. Reassigning ${bench.name} to ${nextPort}.`, 'env');

  const updated = await benchesRepo.update(bench.id, { httpPort: nextPort });
  return updated ?? { ...bench, httpPort: nextPort };
};


const waitForBackend = async (
  command: string,
  commonArgs: string[],
  benchPath: string,
  runtimeEnv: NodeJS.ProcessEnv,
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void; startStep: (id: string, name: string) => void; completeStep: (id: string, name: string) => void }
): Promise<void> => {
  context.startStep('wait', 'Waiting for backend to become healthy (copying assets/apps)');
  let backendReady = false;
  const maxRetries = 60; // 5 minutes (5s intervals)
  for (let i = 0; i < maxRetries; i++) {
    // Check service health status via docker-compose ps
    const { stdout } = await execPromise(
      command,
      [...commonArgs, 'ps', 'backend', '--format', '{{.Health}}'],
      benchPath,
      undefined,
      runtimeEnv,
      5000
    ).catch(() => ({ stdout: '' })); // Fallback if format is not supported

    if (stdout.trim().toLowerCase().includes('healthy')) {
      backendReady = true;
      break;
    }

    // Fallback for older compose/podman: check if service is running and files exist
    const { code: checkCode } = await execPromise(
      command,
      [...commonArgs, 'exec', '-T', 'backend', 'ls', 'sites/apps.txt'],
      benchPath,
      undefined,
      runtimeEnv,
      2000
    ).catch(() => ({ code: 1 }));

    if (checkCode === 0) {
      backendReady = true;
      break;
    }

    // Small delay before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  if (!backendReady) {
    throw new Error('Backend failed to initialize within the expected time. The asset/app copy might still be running or failed.');
  }
  context.completeStep('wait', 'Backend is ready');
};

const resolveBenchBranch = (frappeVersion: string): string => {
  const normalized = frappeVersion.trim().toLowerCase();

  if (normalized === 'develop') {
    return 'develop';
  }

  const branchStyle = normalized.match(/^version-(\d+)$/);
  if (branchStyle) {
    return `version-${branchStyle[1]}`;
  }

  const semverStyle = normalized.match(/^v?(\d+)(?:\.\d+){0,2}$/);
  if (semverStyle) {
    return `version-${semverStyle[1]}`;
  }

  return 'develop';
};

const resolveCatalogBranch = (catalogItem: AppCatalogItem | null, benchFrappeVersion: string): string | null => {
  if (!catalogItem) {
    return null;
  }

  const benchBranch = resolveBenchBranch(benchFrappeVersion);
  const fallbackCatalogItem = DEFAULT_CATALOG_BY_APP_ID.get(catalogItem.id);
  const catalogInstallBranches = catalogItem.installBranches;
  const catalogMappedBranch = catalogInstallBranches?.[benchBranch]
    ?? catalogInstallBranches?.[benchFrappeVersion.trim().toLowerCase()];
  if (catalogMappedBranch?.trim()) {
    return catalogMappedBranch.trim();
  }

  const catalogInstallBranch = catalogItem.installBranch?.trim();
  const fallbackInstallBranch = fallbackCatalogItem?.installBranch?.trim();
  const fallbackInstallBranches = fallbackCatalogItem?.installBranches;

  // Persisted catalogs from older snapshots may only contain installBranch, while
  // newer defaults provide a branch matrix (e.g. wiki version-16 -> develop).
  // If both installBranch values match and there is no per-item matrix, prefer
  // the default matrix for the target bench branch.
  const shouldPreferFallbackMatrix =
    !catalogInstallBranches
    && Boolean(catalogInstallBranch)
    && catalogInstallBranch === fallbackInstallBranch
    && Boolean(fallbackInstallBranches);

  if (shouldPreferFallbackMatrix) {
    const fallbackMappedBranch = fallbackInstallBranches?.[benchBranch]
      ?? fallbackInstallBranches?.[benchFrappeVersion.trim().toLowerCase()];
    if (fallbackMappedBranch?.trim()) {
      return fallbackMappedBranch.trim();
    }
  }

  if (catalogInstallBranch) {
    return catalogInstallBranch;
  }

  const fallbackMappedBranch = fallbackInstallBranches?.[benchBranch]
    ?? fallbackInstallBranches?.[benchFrappeVersion.trim().toLowerCase()];
  if (fallbackMappedBranch?.trim()) {
    return fallbackMappedBranch.trim();
  }

  if (fallbackInstallBranch) {
    return fallbackInstallBranch;
  }

  const version = catalogItem.version.trim().toLowerCase();
  if (!version) {
    return null;
  }

  if (version === 'develop') {
    return 'develop';
  }

  const semverStyle = version.match(/^v?(\d+)(?:\.\d+){0,2}$/);
  if (!semverStyle) {
    return null;
  }

  return `version-${semverStyle[1]}`;
};

const isTimeoutError = (error: unknown): boolean => {
  const message = errorMessage(error);
  return message.toLowerCase().includes('timed out');
};

const resolveAppInstallTimeout = (totalApps: number): number => {
  const extraBudget = Math.max(0, totalApps - 1) * 300000;
  return Math.min(OPERATION_TIMEOUTS.APP_INSTALL_BASE + extraBudget, OPERATION_TIMEOUTS.APP_INSTALL);
};



const execWithTimeoutRetry = async (
  command: string,
  args: string[],
  cwd: string,
  onOutput: ((out: string) => void) | undefined,
  env: NodeJS.ProcessEnv,
  timeout: number,
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string,
  label: string
): Promise<Awaited<ReturnType<typeof execPromise>>> => {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await execPromise(command, args, cwd, onOutput, env, timeout);
    } catch (error) {
      if (!isTimeoutError(error) || attempt === maxAttempts) {
        throw error;
      }

      context.log('warning', `${label} timed out (attempt ${attempt}/${maxAttempts}). Retrying once...`, stepId);
    }
  }

  throw new Error(`${label} failed unexpectedly.`);
};

const cleanupBenchAppArtifacts = (
  benchPath: string,
  appIds: readonly string[],
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string
): void => {
  if (appIds.length === 0) {
    return;
  }

  const uniqueAppIds = [...new Set(appIds.map((app) => app.trim()).filter(Boolean))];
  if (uniqueAppIds.length === 0) {
    return;
  }

  const appsDir = path.join(benchPath, 'apps');
  const appsTxtPath = path.join(benchPath, 'sites', 'apps.txt');

  for (const app of uniqueAppIds) {
    try {
      fs.rmSync(path.join(appsDir, app), { recursive: true, force: true });
    } catch (error) {
      context.log('warning', `Failed to cleanup app directory for ${app}: ${errorMessage(error)}`, stepId);
    }
  }

  if (!fs.existsSync(appsTxtPath)) {
    return;
  }

  try {
    const existing = fs.readFileSync(appsTxtPath, 'utf8');
    const filtered = existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !uniqueAppIds.includes(line));
    const content = filtered.length > 0 ? `${filtered.join('\n')}\n` : '';
    fs.writeFileSync(appsTxtPath, content, 'utf8');
  } catch (error) {
    context.log('warning', `Failed to cleanup apps.txt after install failure: ${errorMessage(error)}`, stepId);
  }
};

const normalizeBenchApps = (apps: readonly string[]): string[] => {
  return Array.from(new Set(apps.map((app) => app.trim()).filter(Boolean)));
};

const getAppDelta = (previousApps: readonly string[], nextApps: readonly string[]) => {
  const previous = normalizeBenchApps(previousApps);
  const next = normalizeBenchApps(nextApps);

  return {
    previous,
    next,
    install: next.filter((app) => app !== 'frappe' && !previous.includes(app)),
    remove: previous.filter((app) => app !== 'frappe' && !next.includes(app)),
  };
};

const fetchBenchApps = async (
  context: TaskExecutionContext,
  options: {
    stepId: string;
    stepStartDesc: string;
    stepCompleteDesc: string;
    apps: readonly string[];
    bench: Bench;
    appCatalogRepo?: { findById?: (id: string) => Promise<AppCatalogItem | null> };
    projectName: string;
    runtimeCmd: string;
    runtimeEnv: NodeJS.ProcessEnv;
    onAttemptedInstall: (app: string) => void;
  }
): Promise<void> => {
  if (options.apps.length === 0) return;

  const { stepId, stepStartDesc, stepCompleteDesc, apps, bench, appCatalogRepo, projectName, runtimeCmd, runtimeEnv, onAttemptedInstall } = options;

  context.startStep(stepId, stepStartDesc);
  const appInstallTimeout = resolveAppInstallTimeout(apps.length);
  const benchBranch = resolveBenchBranch(bench.frappeVersion);

  for (const [index, app] of apps.entries()) {
    onAttemptedInstall(app);
    const catalogItem = appCatalogRepo?.findById ? await appCatalogRepo.findById(app) : null;
    const appSource = catalogItem?.source?.trim() || app;
    const appBranch = resolveCatalogBranch(catalogItem, bench.frappeVersion) ?? benchBranch;

    context.log('info', `[${index + 1}/${apps.length}] Fetching app ${app} via bench get-app (${appBranch})`, stepId);
    const { code, stderr } = await execWithTimeoutRetry(
      runtimeCmd,
      composeBenchArgs(projectName, ['get-app', '--overwrite', '--branch', appBranch, appSource]),
      bench.path,
      (out: string) => context.log('info', out, stepId),
      runtimeEnv,
      appInstallTimeout,
      context,
      stepId,
      `Fetching app ${app}`
    );

    if (code !== 0) {
      throw new Error(`Failed to fetch app ${app}: ${stderr}`);
    }
  }

  context.completeStep(stepId, stepCompleteDesc);
};


/**
 * Main orchestration logic for creating a new Bench.
 * Handles configuration generation, docker-compose bringing up containers,
 * installing the selected apps, and updating the database state.
 */
export const orchestrateBenchCreation = (
  bench: Bench,
  benchesRepo: {
    update: (id: string, payload: Partial<Bench>) => Promise<Bench | null>;
    delete?: (id: string) => Promise<boolean>;
  },
  appCatalogRepo?: {
    findById?: (id: string) => Promise<AppCatalogItem | null>;
  }
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Create Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      let attemptedCreateAppInstalls: string[] = [];
      let failingStepId = 'start';
      try {
        await benchesRepo.update(bench.id, { status: 'queued' });

        context.startStep('runtime', `Checking podman status`);
        const isRuntimeReady = await ensureRuntimeRunning();
        if (!isRuntimeReady) {
          throw new Error(`Podman is not running and could not be started automatically. Please start it manually.`);
        }
        context.completeStep('runtime', `Podman is ready`);

        // Ensure bench directory exists
        context.startStep('init', `Initializing bench directory at ${bench.path}`);
        if (!fs.existsSync(bench.path)) {
          fs.mkdirSync(bench.path, { recursive: true });
        }
        // Create sites and apps directories so volume mounts are happy
        const sitesDir = path.join(bench.path, 'sites');
        const appsDir = path.join(bench.path, 'apps');
        if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });
        if (!fs.existsSync(appsDir)) fs.mkdirSync(appsDir, { recursive: true });

        // Initialize essential bench files if missing
        const appsTxtPath = path.join(sitesDir, 'apps.txt');
        if (!fs.existsSync(appsTxtPath)) {
          fs.writeFileSync(appsTxtPath, 'frappe\n', 'utf8');
        }

        const commonConfigPath = path.join(sitesDir, 'common_site_config.json');
        if (!fs.existsSync(commonConfigPath)) {
          const config = {
            db_host: 'db',
            db_port: '3306',
            redis_cache: 'redis://redis:6379',
            redis_queue: 'redis://redis:6379',
            redis_socketio: 'redis://redis:6379',
            socketio_port: 9000,
          };
          fs.writeFileSync(commonConfigPath, JSON.stringify(config, null, 1), 'utf8');
        }

        context.completeStep('init', 'Bench directory initialized');

        context.startStep('env', 'Generating docker-compose configuration');
        const benchWithPort = await resolveAndPersistBenchPort(bench, benchesRepo, context, true);
        ensureBenchComposeWritten(bench.path, bench.frappeVersion, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT);
        context.completeStep('env', `Compose generated (HTTP port ${benchWithPort.httpPort})`);

        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const composePath = getBenchComposePath(bench.path);
        const commonArgs = benchComposeArgs(projectName, composePath);
        const runtimeEnv = await getRuntimeEnv();

        context.startStep('pull', 'Pulling images');
        failingStepId = 'pull';
        await execPromise(command, [...commonArgs, 'pull'], bench.path, (out) => context.log('info', out, 'pull'), runtimeEnv, OPERATION_TIMEOUTS.IMAGE_PULL);
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
          300000
        );

        if (code !== 0) {
          const combinedOutput = `${stdout}\n${stderr}`;
          const failure = code === 137 || isLikelyOutOfMemory(combinedOutput)
            ? humanizeCreateFailure('bench', `code ${code}: ${combinedOutput}`)
            : `Command failed with code ${code}: ${stderr}`;
          throw new Error(failure);
        }

        context.completeStep('start', 'Containers started');

        failingStepId = 'wait';
        await waitForBackend(command, commonArgs, bench.path, runtimeEnv, context);

        const appsToInstall = (bench.apps ?? [])
          .map((app) => app.trim())
          .filter(Boolean)
          .filter((app) => !CORE_BENCH_APPS_SET.has(app));


        if (appsToInstall.length > 0) {
          failingStepId = 'apps';
          await fetchBenchApps(context, {
            stepId: 'apps',
            stepStartDesc: `Adding ${appsToInstall.length} app${appsToInstall.length === 1 ? '' : 's'} to bench`,
            stepCompleteDesc: 'Selected apps added to bench',
            apps: appsToInstall,
            bench,
            appCatalogRepo,
            projectName,
            runtimeCmd: command,
            runtimeEnv,
            onAttemptedInstall: (app) => {
              attemptedCreateAppInstalls = [...attemptedCreateAppInstalls, app];
            }
          });
        }

        await benchesRepo.update(bench.id, { status: 'running' });
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

        try {
          context.startStep('cleanup', 'Cleaning up partial bench resources');

          if (attemptedCreateAppInstalls.length > 0) {
            cleanupBenchAppArtifacts(bench.path, attemptedCreateAppInstalls, context, 'cleanup');
          }

          const runtimeReady = await ensureRuntimeRunning();
          if (runtimeReady) {
            const runtimeEnv = await getRuntimeEnv();
            await execPromise(
              getBinaryPath('docker-compose'),
              ['-p', getComposeProjectName(bench.id), 'down', '-v', '--remove-orphans'],
              bench.path,
              (out) => context.log('info', out, 'cleanup'),
              runtimeEnv,
              OPERATION_TIMEOUTS.DOCKER_CLEANUP
            );
          } else {
            context.log('warning', 'Runtime unavailable. Skipping container cleanup after failed create.', 'cleanup');
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

        throw new Error(message);
      }
    }
  });
};

/**
 * Orchestrates fetching, installing, or building apps against an existing bench.
 * Used when adding or updating apps after bench creation.
 */
export const orchestrateBenchAppChanges = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  appCatalogRepo: { findById?: (id: string) => Promise<AppCatalogItem | null> } | undefined,
  previousApps: readonly string[],
  nextApps: readonly string[]
): void => {
  const taskRunner = getTaskRunner();
  const delta = getAppDelta(previousApps, nextApps);

  if (delta.install.length === 0 && delta.remove.length === 0) {
    return;
  }

  taskRunner.enqueue({
    name: `Update Bench Apps ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      let attemptedInstallAppIds: string[] = [];
      try {
        if (bench.status !== 'running') {
          throw new Error(`Bench ${bench.name} must be running before installed apps can be changed.`);
        }

        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const runtimeEnv = await getRuntimeEnv();

        if (delta.install.length > 0) {
          await fetchBenchApps(context, {
            stepId: 'install-apps',
            stepStartDesc: `Installing ${delta.install.length} app${delta.install.length === 1 ? '' : 's'}`,
            stepCompleteDesc: 'Selected apps installed',
            apps: delta.install,
            bench,
            appCatalogRepo,
            projectName,
            runtimeCmd: command,
            runtimeEnv,
            onAttemptedInstall: (app) => {
              attemptedInstallAppIds = [...attemptedInstallAppIds, app];
            }
          });
        }

        if (delta.remove.length > 0) {
          context.startStep('remove-apps', `Removing ${delta.remove.length} app${delta.remove.length === 1 ? '' : 's'}`);

          for (const app of delta.remove) {
            context.log('info', `Removing app ${app} from bench`, 'remove-apps');
            const { code, stderr } = await execPromise(
              command,
              composeBenchArgs(projectName, ['remove-app', app]),
              bench.path,
              (out) => context.log('info', out, 'remove-apps'),
              runtimeEnv,
              OPERATION_TIMEOUTS.APP_INSTALL
            );

            if (code !== 0) {
              throw new Error(`Failed to remove app ${app}: ${stderr}`);
            }
          }

          context.completeStep('remove-apps', 'Selected apps removed');
        }

        const persistedBench = await benchesRepo.update(bench.id, { apps: delta.next });
        if (!persistedBench) {
          throw new Error(`Failed to persist updated apps for bench ${bench.name}.`);
        }

        context.completeStep('apps', 'Bench apps updated');
      } catch (error) {
        if (attemptedInstallAppIds.length > 0) {
          try {
            context.startStep('rollback-apps', 'Cleaning up partial app installation');
            cleanupBenchAppArtifacts(bench.path, attemptedInstallAppIds, context, 'rollback-apps');
            context.completeStep('rollback-apps', 'Partial app artifacts cleaned');
          } catch (cleanupError) {
            context.log('warning', `Rollback cleanup failed: ${errorMessage(cleanupError)}`, 'rollback-apps');
          }
        }

        context.log('error', errorMessage(error), 'apps');
        throw error;
      }
    }
  });
};

/**
 * Boots up an existing stopped bench.
 * This function waits for the backend to become healthy before marking it running.
 */
export const orchestrateBenchStart = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  isRestart = false
): void => {
  const taskRunner = getTaskRunner();

  const CORE_BENCH_SERVICES = ['db', 'backend'] as const;

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

  taskRunner.enqueue({
    name: isRestart ? `Restart Bench ${bench.name}` : `Start Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
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
        const isRuntimeReady = await ensureRuntimeRunning();
        if (!isRuntimeReady) {
          throw new Error('Podman is not running and could not be started automatically.');
        }
        context.completeStep('runtime', 'Podman is ready');

        context.startStep('env', 'Generating docker-compose configuration');
        const benchWithPort = await resolveAndPersistBenchPort(bench, benchesRepo, context, !isRestart);
        ensureBenchComposeWritten(bench.path, bench.frappeVersion, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT);
        context.completeStep('env', `Compose generated (HTTP port ${benchWithPort.httpPort})`);

        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const composePath = getBenchComposePath(bench.path);
        const commonArgs = benchComposeArgs(projectName, composePath);
        const runtimeEnv = await getRuntimeEnv();

        if (!isRestart) {
          context.startStep('pull', 'Checking for image updates');
          await execPromise(command, [...commonArgs, 'pull'], bench.path, (out) => context.log('info', out, 'pull'), runtimeEnv, OPERATION_TIMEOUTS.IMAGE_PULL);
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
            runtimeEnv,
            OPERATION_TIMEOUTS.SITE_CREATION
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
            runtimeEnv,
            OPERATION_TIMEOUTS.DEFAULT
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

        context.completeStep('start', 'Containers are running');

        await waitForBackend(command, commonArgs, bench.path, runtimeEnv, context);

        await benchesRepo.update(bench.id, { status: 'running' });
      } catch (error) {
        context.log('error', errorMessage(error));
        await benchesRepo.update(bench.id, { status: 'failure' });
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
      combined.includes('no such container')
    );
  };

  taskRunner.enqueue({
    name: `Stop Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
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
            runtimeEnv,
            OPERATION_TIMEOUTS.BENCH_STOP
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
            runtimeEnv,
            OPERATION_TIMEOUTS.BENCH_STOP
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
        await benchesRepo.update(bench.id, { status: 'failure' });
        throw error;
      }
    }
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
    run: async (context) => {
      try {
        context.startStep('scan', 'Scanning for sites');

        // 1. Get sites from DB
        let allSites = await sitesRepo.findAll();
        const dbSites = allSites.filter(s => s.benchId === bench.id).map(s => s.name);

        // 2. Get sites from Disk
        let diskSites: string[] = [];
        const sitesPath = path.join(bench.path, 'sites');
        if (fs.existsSync(sitesPath)) {
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

        const runtimeCmd = getBinaryPath('docker-compose');
        const runtimeEnv = await getRuntimeEnv();
        const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;
        const projectName = getComposeProjectName(bench.id);

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
            const { code, stderr } = await execPromise(runtimeCmd, args, bench.path, (out) => context.log('info', out, 'drop'), runtimeEnv, OPERATION_TIMEOUTS.BENCH_CLEANUP);
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
    run: async (context) => {
      const removeBenchDirectoryBestEffort = () => {
        context.startStep('fs', 'Removing bench directory');
        try {
          if (fs.existsSync(bench.path)) {
            fs.rmSync(bench.path, { recursive: true, force: true });
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
        const runtimeReady = await ensureRuntimeRunning();
        if (runtimeReady) {
          context.completeStep('runtime', 'Podman is ready');
        } else {
          context.log('warning', 'Podman is not running and could not be started automatically. Continuing with local force deletion.');
          context.completeStep('runtime', 'Podman unavailable; skipping container cleanup');
        }

        context.startStep('deleting', 'Deleting...');
        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const args = ['-p', projectName, 'down', '-v', '--remove-orphans'];

        if (!runtimeReady) {
          context.completeStep('deleting', 'Docker cleanup skipped (runtime unavailable)');
        } else {
          let runtimeEnv = await getRuntimeEnv();
          const podmanCommand = getBinaryPath('podman');

          const runProjectCleanup = async () => {
            await cleanupPodmanResources(
              podmanCommand,
              projectFilterArgs(projectName),
              runtimeEnv,
              OPERATION_TIMEOUTS.DOCKER_CLEANUP,
              { info: (msg) => context.log('info', msg, 'stop'), warn: (msg) => context.log('warning', msg, 'stop') }
            );
          };

          try {
            const { code, stderr } = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'stop'), runtimeEnv, OPERATION_TIMEOUTS.DOCKER_CLEANUP);
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
              const runtimeRecovered = await ensureRuntimeRunning();
              if (runtimeRecovered) {
                runtimeEnv = await getRuntimeEnv();
                try {
                  const retryResult = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'stop'), runtimeEnv, OPERATION_TIMEOUTS.DOCKER_CLEANUP);
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

        removeBenchDirectoryBestEffort();

        if (options?.onDeleted) {
          try {
            await options.onDeleted(bench);
          } catch (error) {
            context.log('warning', `Post-delete bench cleanup failed: ${errorMessage(error)}`);
          }
        }
      } catch (error) {
        removeBenchDirectoryBestEffort();
        context.log('error', `Force deletion failed: ${errorMessage(error)}`);
        // If it fails, at least ensure it's not stuck in 'queued'
        await benchesRepo.update(bench.id, { status: 'failure' });
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
        runtimeEnv,
        OPERATION_TIMEOUTS.BENCH_STOP
      );
    } catch (error) {
      logger.warn(`Failed to clean compose project ${projectName}: ${error}`);
    }
  }

  // Clean up any orphaned podman resources matching the local-bench prefix
  const podmanBinary = getBinaryPath('podman');
  await cleanupPodmanResources(
    podmanBinary,
    nameFilterArgs('local-bench-'),
    runtimeEnv,
    60000,
    { info: () => {}, warn: (msg) => logger.warn(msg) }
  );
};
