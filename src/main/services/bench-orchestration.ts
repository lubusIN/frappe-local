import { execPromise } from '@frappe-local/main/utils/exec';
import { errorMessage } from '@frappe-local/shared/core/utils';
import { getBinaryPath } from '@frappe-local/main/utils/binaries';
import path from 'node:path';
import fs from 'node:fs';
import { getTaskRunner, type TaskExecutionContext } from '@frappe-local/main/services/task-runner';
import type { Bench, CustomAppItem, Site } from '@frappe-local/shared/domain/models';
import { ensureRuntimeRunning, getLastRuntimeError, getRuntimeEnv } from '@frappe-local/main/services/runtime-service';
import { DATABASE_CREDENTIALS, IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS } from '@frappe-local/main/constants';
import { findNextAvailableTcpPort, isTcpPortFree } from '@frappe-local/main/utils/ports';
import { humanizeCreateFailure, isLikelyOutOfMemory } from '@frappe-local/shared/core/runtime-errors';
import { ensureBenchComposeWritten, getBenchComposePath } from '@frappe-local/main/utils/podman/bench-compose';
import { benchComposeArgs, getComposeProjectName, composeBenchArgs, composeExecArgs } from '@frappe-local/main/utils/podman/compose-args';
import { cleanupPodmanResources, projectFilterArgs, nameFilterArgs } from '@frappe-local/main/utils/podman/podman-cleanup';
import type { AppCatalogItem } from '@frappe-local/shared/domain/models';
import { getDefaultAppCatalogSeed } from '@frappe-local/main/services/catalog-provider';
import { DEFAULT_HTTP_PORT } from '@frappe-local/main/utils/bench-http-port';

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
  const defaultCatalogByAppId = new Map(getDefaultAppCatalogSeed().map((item) => [item.id, item]));
  const fallbackCatalogItem = defaultCatalogByAppId.get(catalogItem.id);
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


const cleanupBenchAppArtifacts = async (
  benchPath: string,
  appIds: readonly string[],
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string
): Promise<void> => {
  if (appIds.length === 0) {
    return;
  }

  const uniqueAppIds = [...new Set(appIds.map((app) => app.trim()).filter(Boolean))];
  if (uniqueAppIds.length === 0) {
    return;
  }

  const appsDir = path.join(benchPath, 'apps');
  const assetsDir = path.join(benchPath, 'sites', 'assets');
  const appsTxtPath = path.join(benchPath, 'sites', 'apps.txt');

  for (const app of uniqueAppIds) {
    try {
      await fs.promises.rm(path.join(appsDir, app), { recursive: true, force: true });
    } catch (error) {
      context.log('warning', `Failed to cleanup app directory for ${app}: ${errorMessage(error)}`, stepId);
    }

    try {
      await fs.promises.rm(path.join(assetsDir, app), { recursive: true, force: true });
    } catch (error) {
      context.log('warning', `Failed to cleanup app assets for ${app}: ${errorMessage(error)}`, stepId);
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

const ensureBenchProcfile = (
  benchPath: string,
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string
): void => {
  const procfilePath = path.join(benchPath, 'Procfile');
  const content = [
    'web: DEV_SERVER=0 bench serve --port 8000 --proxy',
    'socketio: FRAPPE_SOCKETIO_PORT=9000 node apps/frappe/socketio.js',
    'watch: bench watch',
    'schedule: bench schedule',
    'worker: bench worker 1>> logs/worker.log 2>> logs/worker.error.log',
    '',
  ].join('\n');

  try {
    fs.writeFileSync(procfilePath, content, 'utf8');
  } catch (error) {
    context.log('warning', `Failed to write managed Procfile: ${errorMessage(error)}`, stepId);
  }
};

const getFirstBenchSiteName = (benchPath: string): string | null => {
  const sitesPath = path.join(benchPath, 'sites');
  if (!fs.existsSync(sitesPath)) {
    return null;
  }

  try {
    const siteNames = fs.readdirSync(sitesPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !['assets', 'common_site_config.json'].includes(name))
      .sort((left, right) => left.localeCompare(right));

    return siteNames[0] ?? null;
  } catch {
    return null;
  }
};

const ensureBenchSocketioPort = (
  benchPath: string,
  _httpPort: number,
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string
): void => {
  try {
    const configPath = path.join(benchPath, 'sites', 'common_site_config.json');
    if (!fs.existsSync(configPath)) {
      return;
    }

    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Keep the key present for apps that import common_site_config.json at build
    // time, but point browser clients back at the Caddy HTTPS front door instead
    // of the raw Socket.IO container port.
    let changed = false;
    const socketioPort = 443;
    if (configData.socketio_port !== socketioPort) {
      configData.socketio_port = socketioPort;
      changed = true;
    }

    const defaultSite = getFirstBenchSiteName(benchPath);
    if (defaultSite && configData.default_site !== defaultSite) {
      configData.default_site = defaultSite;
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 1), 'utf8');
    }
  } catch (error) {
    context.log('warning', `Failed to configure socketio port: ${errorMessage(error)}`, stepId);
  }
};

const normalizeBenchApps = (apps?: readonly string[] | null): string[] => {
  if (!apps) return [];
  return Array.from(new Set(apps.map((app) => app.trim()).filter(Boolean)));
};

const getLocalAppVolumes = async (appNames: readonly string[], customAppsRepo?: { findAll?: () => Promise<CustomAppItem[]> }): Promise<Array<{ source: string; target: string }>> => {
  if (!customAppsRepo?.findAll) return [];
  const customAppsList = await customAppsRepo.findAll();
  const localVolumes: Array<{ source: string; target: string }> = [];
  
  const safeAppNames = Array.isArray(appNames) 
    ? appNames 
    : (typeof appNames === 'string' ? [appNames] : []);
  for (const app of safeAppNames) {
    const customApp = customAppsList.find((candidate) => candidate.name === app);
    if (customApp && customApp.type === 'local' && customApp.source) {
      localVolumes.push({
        source: customApp.source,
        target: `/workspace/apps/${customApp.name}`,
      });
    }
  }
  return localVolumes;
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
    customAppsRepo?: { findAll?: () => Promise<CustomAppItem[]> };
    projectName: string;
    runtimeCmd: string;
    runtimeEnv: NodeJS.ProcessEnv;
    onAttemptedInstall: (app: string) => void;
  }
): Promise<void> => {
  if (options.apps.length === 0) return;

  const { stepId, stepStartDesc, stepCompleteDesc, apps, bench, appCatalogRepo, customAppsRepo, projectName, runtimeCmd, runtimeEnv, onAttemptedInstall } = options;

  context.startStep(stepId, stepStartDesc);
  
  const benchBranch = resolveBenchBranch(bench.frappeVersion);

  const customAppsList = customAppsRepo?.findAll ? await customAppsRepo.findAll() : [];

  for (const [index, app] of apps.entries()) {
    onAttemptedInstall(app);
    
    // Check if it's a custom app
    const customApp = customAppsList.find((candidate) => candidate.name === app);
    let getAppArgs: string[] = [];

    if (customApp) {
      if (customApp.type === 'local') {
        // For local apps, we don't fetch them using get-app with URL.
        // Instead, we just pip install -e /workspace/apps/${app} or whatever path they are mapped to.
        // Wait, Frappe uses standard python paths. 
        // We will just tell bench to install it if it's not already installed.
        // Actually `bench get-app` clones it. If it's already mapped via docker-compose into `/workspace/apps/${app}`, we just need to install it.
        context.log('info', `[${index + 1}/${apps.length}] Installing local app ${app}`, stepId);
        // We use pip install -e and yarn install in the app folder
        const pipArgs = composeExecArgs(projectName, 'frappe', ['bench', 'pip', 'install', '-e', `apps/${app}`]);
        const pipResult = await execPromise(runtimeCmd, pipArgs, bench.path, (out: string) => context.log('info', out, stepId), runtimeEnv, { idleTimeout: 5 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS });
        if (pipResult.code !== 0) throw new Error(`Failed to pip install local app ${app}`);

        // Try yarn install if package.json exists
        const yarnArgs = composeExecArgs(projectName, 'frappe', ['sh', '-c', `if [ -f apps/${app}/package.json ]; then cd apps/${app} && yarn install; fi`]);
        await execPromise(runtimeCmd, yarnArgs, bench.path, (out: string) => context.log('info', out, stepId), runtimeEnv, { idleTimeout: 5 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS });
        
        // Add to apps.txt if not present
        const appsTxtArgs = composeExecArgs(projectName, 'frappe', ['sh', '-c', `grep -qFx "${app}" sites/apps.txt || echo "${app}" >> sites/apps.txt`]);
        await execPromise(runtimeCmd, appsTxtArgs, bench.path, (out: string) => context.log('info', out, stepId), runtimeEnv, { idleTimeout: 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS });
        continue;
      } else {
        // GitHub Custom App
        const appSource = customApp.source;
        const appBranch = customApp.branch || benchBranch;
        context.log('info', `[${index + 1}/${apps.length}] Fetching custom app ${app} via bench get-app (${appBranch})`, stepId);
        getAppArgs = ['get-app', '--overwrite', '--branch', appBranch, appSource];
      }
    } else {
      // Standard catalog app
      const catalogItem = appCatalogRepo?.findById ? await appCatalogRepo.findById(app) : null;
      const appSource = catalogItem?.source?.trim() || app;
      const appBranch = resolveCatalogBranch(catalogItem, bench.frappeVersion) ?? benchBranch;

      context.log('info', `[${index + 1}/${apps.length}] Fetching app ${app} via bench get-app (${appBranch})`, stepId);
      getAppArgs = ['get-app', '--overwrite', '--branch', appBranch, appSource];
    }

    const args = composeBenchArgs(projectName, getAppArgs);
    let result;
    try {
      result = await execPromise(
        runtimeCmd,
        args,
        bench.path,
        (out: string) => context.log('info', out, stepId),
        runtimeEnv,
        { idleTimeout: 30 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS }
      );
    } catch (error) {
      if (!errorMessage(error).includes('Command timed out')) {
        throw error;
      }

      context.log('warning', `Fetching app ${app} timed out. Retrying once.`, stepId);
      result = await execPromise(
        runtimeCmd,
        args,
        bench.path,
        (out: string) => context.log('info', out, stepId),
        runtimeEnv,
        { idleTimeout: 30 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS }
      );
    }

    if (result.code !== 0) {
      throw new Error(`Failed to fetch app ${app}: ${result.stderr}`);
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
  },
    customAppsRepo?: {
      findAll?: () => Promise<CustomAppItem[]>;
    },
    shareSshKeys: boolean = false
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Create Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      let attemptedCreateAppInstalls: string[] = [];
      let failingStepId = 'start';
      let runtimeReadyForCleanup = false;
      try {
        await benchesRepo.update(bench.id, { status: 'queued' });

        failingStepId = 'runtime';
        context.startStep('runtime', `Checking podman status`);
        const isRuntimeReady = await ensureRuntimeRunning();
        if (!isRuntimeReady) {
          throw new Error(
            getLastRuntimeError() ||
            'Podman is not running and could not be started automatically. Please start it manually.'
          );
        }
        runtimeReadyForCleanup = true;
        context.completeStep('runtime', `Podman is ready`);

        // Ensure bench directory exists
        context.startStep('init', `Initializing bench directory at ${bench.path}`);
        if (!fs.existsSync(bench.path)) {
          fs.mkdirSync(bench.path, { recursive: true });
        }
        context.completeStep('init', 'Bench directory initialized');

        context.startStep('env', 'Generating docker-compose configuration');
        const benchWithPort = await resolveAndPersistBenchPort(bench, benchesRepo, context, true);
        const localVolumes = await getLocalAppVolumes(bench.apps ?? [], customAppsRepo);
        ensureBenchComposeWritten(bench.path, bench.frappeVersion, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, shareSshKeys, localVolumes);
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
        
        await execPromise(
          command,
          initArgs,
          bench.path,
          (out) => context.log('info', out, 'setup'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );

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
        ensureBenchSocketioPort(bench.path, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, context, 'setup');
        ensureBenchProcfile(bench.path, context, 'setup');
        
        context.completeStep('setup', 'Bench initialized and configured');

        const appsToInstall = (bench.apps ?? [])
          .map((app) => app.trim())
          .filter(Boolean)
          .filter((app) => app !== 'frappe');

        if (appsToInstall.length > 0) {
          failingStepId = 'apps';
          await fetchBenchApps(context, {
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
          [...commonArgs, 'exec', '-d', 'frappe', 'bench', 'start'],
          bench.path,
          (out) => context.log('info', out, 'run'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        context.completeStep('run', 'Bench processes started');

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
  customAppsRepo: { findAll?: () => Promise<CustomAppItem[]> } | undefined,
  shareSshKeys: boolean = false,
  previousApps: readonly string[],
  nextApps: readonly string[]
): void => {
  const taskRunner = getTaskRunner();
  const delta = getAppDelta(previousApps, nextApps);

  if (delta.install.length === 0 && delta.remove.length === 0) {
    return;
  }

  const appName = delta.install[0] || delta.remove[0] || 'apps';
  const actionVerb = delta.install.length > 0 ? 'Get' : 'Remove';

  taskRunner.enqueue({
    name: `${actionVerb} app ${appName} on ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      let attemptedInstallAppIds: string[] = [];
      let recoveryEnv: {
        command: string;
        projectName: string;
        runtimeEnv: NodeJS.ProcessEnv;
      } | null = null;
      try {
        if (bench.status !== 'running') {
          throw new Error(`Bench ${bench.name} must be running before installed apps can be changed.`);
        }

        context.startStep('runtime', 'Checking podman status');
        const runtimeReady = await ensureRuntimeRunning();
        if (!runtimeReady) {
          throw new Error(
            getLastRuntimeError() ||
            'Podman is not running and could not be started automatically.'
          );
        }
        context.completeStep('runtime', 'Podman is ready');

        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const localVolumes = await getLocalAppVolumes(nextApps, customAppsRepo);
        const composePath = ensureBenchComposeWritten(
          bench.path,
          bench.frappeVersion,
          bench.httpPort ?? DEFAULT_HTTP_PORT,
          shareSshKeys,
          localVolumes
        );
        const commonArgs = benchComposeArgs(projectName, composePath);
        const runtimeEnv = await getRuntimeEnv();

        context.startStep('bench-service', 'Ensuring bench containers are running');
        const serviceResult = await execPromise(
          command,
          [...commonArgs, 'up', '-d', '--remove-orphans', 'frappe'],
          bench.path,
          (out) => context.log('info', out, 'bench-service'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        if (serviceResult.code !== 0) {
          throw new Error(
            `Could not start bench containers for ${bench.name}: ${serviceResult.stderr || serviceResult.stdout}`
          );
        }
        context.completeStep('bench-service', 'Bench containers are running');
        recoveryEnv = { command, projectName, runtimeEnv };
        ensureBenchSocketioPort(bench.path, bench.httpPort ?? DEFAULT_HTTP_PORT, context, 'bench-service');
        ensureBenchProcfile(bench.path, context, 'bench-service');

        // Temporarily pause background bench processes (watch, workers, web) to free up the 4GB VM memory
        // and avoid file lock collisions during yarn install and bench build.
        try {
          context.startStep('pause-bench', 'Pausing background processes to free memory');
          const pauseResult = await execPromise(
            command,
            composeExecArgs(projectName, 'frappe', ['pkill', '-f', 'honcho']),
            bench.path,
            (out) => context.log('info', out, 'pause-bench'),
            runtimeEnv,
            { idleTimeout: 30000, maxTimeout: 60000 }
          );

          if (pauseResult.code === 0) {
            context.completeStep('pause-bench', 'Background processes paused');
          } else {
            context.log(
              'warning',
              `Could not pause background processes: ${pauseResult.stderr || pauseResult.stdout}`,
              'pause-bench'
            );
            context.completeStep('pause-bench', 'Background processes were not running');
          }
        } catch (error) {
          context.log('warning', `Could not pause background processes: ${errorMessage(error)}`, 'pause-bench');
          context.completeStep('pause-bench', 'No background processes to pause');
        }

        if (delta.install.length > 0) {
          await fetchBenchApps(context, {
            stepId: 'install-apps',
            stepStartDesc: `Installing ${delta.install.length} app${delta.install.length === 1 ? '' : 's'}`,
            stepCompleteDesc: 'Selected apps installed',
            apps: delta.install,
            bench,
            appCatalogRepo,
            customAppsRepo,
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
            const { code, stderr, stdout } = await execPromise(
              command,
              composeBenchArgs(projectName, ['remove-app', app]),
              bench.path,
              (out) => context.log('info', out, 'remove-apps'),
              runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
            );

            if (code !== 0) {
              if (stderr.includes('AppNotInstalledError') || stdout?.includes('AppNotInstalledError')) {
                context.log('info', `App ${app} is already not installed.`, 'remove-apps');
              } else {
                throw new Error(`Failed to remove app ${app}: ${stderr || stdout}`);
              }
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
            if (!context.signal.aborted) {
              context.startStep('rollback-apps', 'Restoring bench after failed app installation');
            }

            if (recoveryEnv) {
              for (const app of attemptedInstallAppIds) {
                const uninstallResult = await execPromise(
                  recoveryEnv.command,
                  composeBenchArgs(recoveryEnv.projectName, ['pip', 'uninstall', '-y', app]),
                  bench.path,
                  context.signal.aborted
                    ? undefined
                    : (out) => context.log('info', out, 'rollback-apps'),
                  recoveryEnv.runtimeEnv,
                  { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS, signal: null }
                );

                if (uninstallResult.code !== 0 && !context.signal.aborted) {
                  context.log(
                    'warning',
                    `Could not uninstall partial Python package ${app}: ${
                      uninstallResult.stderr || uninstallResult.stdout || `exit code ${uninstallResult.code}`
                    }`,
                    'rollback-apps'
                  );
                }
              }
            }

            await cleanupBenchAppArtifacts(
              bench.path,
              attemptedInstallAppIds,
              context.signal.aborted ? { log: () => undefined } : context,
              'rollback-apps'
            );

            if (recoveryEnv) {
              const rebuildResult = await execPromise(
                recoveryEnv.command,
                composeBenchArgs(recoveryEnv.projectName, ['build']),
                bench.path,
                context.signal.aborted
                  ? undefined
                  : (out) => context.log('info', out, 'rollback-apps'),
                recoveryEnv.runtimeEnv,
                { idleTimeout: 30 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS, signal: null }
              );

              if (rebuildResult.code !== 0 && !context.signal.aborted) {
                context.log(
                  'warning',
                  `Could not rebuild remaining bench assets: ${
                    rebuildResult.stderr || rebuildResult.stdout || `exit code ${rebuildResult.code}`
                  }`,
                  'rollback-apps'
                );
              }
            }

            if (!context.signal.aborted) {
              context.completeStep('rollback-apps', 'Bench restored after failed app installation');
            }
          } catch (cleanupError) {
            if (!context.signal.aborted) {
              context.log('error', `Failed to restore bench state: ${errorMessage(cleanupError)}`, 'rollback-apps');
            }
          }
        }

        // Explicitly revert the DB state to the existing apps to ensure the UI removes the failed app
        try {
          await benchesRepo.update(bench.id, { apps: [...previousApps] });
        } catch (dbCleanupError) {
          context.log('warning', `Failed to revert bench apps in DB: ${errorMessage(dbCleanupError)}`, 'apps');
        }

        if (!context.signal.aborted) {
          context.log('error', errorMessage(error), 'apps');
        }
        throw error;
      } finally {
        if (recoveryEnv) {
          try {
            if (!context.signal.aborted) {
              context.startStep('resume-bench', 'Restarting background bench processes');
            }
            const restartResult = await execPromise(
              recoveryEnv.command,
              ['-p', recoveryEnv.projectName, 'exec', '-d', 'frappe', 'bench', 'start'],
              bench.path,
              context.signal.aborted
                ? undefined
                : (out) => context.log('info', out, 'resume-bench'),
              recoveryEnv.runtimeEnv,
              { idleTimeout: 30000, maxTimeout: 60000, signal: null }
            );

            if (restartResult.code !== 0 && !context.signal.aborted) {
              context.log(
                'warning',
                `Failed to automatically restart bench processes: ${
                  restartResult.stderr || restartResult.stdout || `exit code ${restartResult.code}`
                }`,
                'resume-bench'
              );
            } else if (!context.signal.aborted) {
              context.completeStep('resume-bench', 'Bench processes restarted');
            }
          } catch (recoveryError) {
            if (!context.signal.aborted) {
              context.log(
                'warning',
                `Failed to automatically restart bench processes: ${errorMessage(recoveryError)}`,
                'resume-bench'
              );
            }
          }
        }
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
  customAppsRepo?: { findAll?: () => Promise<CustomAppItem[]> },
  shareSshKeys: boolean = false,
  isRestart = false
): void => {
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
          throw new Error(
            getLastRuntimeError() ||
            'Podman is not running and could not be started automatically.'
          );
        }
        context.completeStep('runtime', 'Podman is ready');

        context.startStep('env', 'Generating docker-compose configuration');
        const benchWithPort = await resolveAndPersistBenchPort(bench, benchesRepo, context, !isRestart);
        const localVolumes = await getLocalAppVolumes(bench.apps, customAppsRepo);
        ensureBenchComposeWritten(bench.path, bench.frappeVersion, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, shareSshKeys, localVolumes);
        ensureBenchSocketioPort(bench.path, benchWithPort.httpPort ?? DEFAULT_HTTP_PORT, context, 'env');
        ensureBenchProcfile(bench.path, context, 'env');
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

        context.completeStep('start', 'Containers are running');

        context.startStep('run', 'Starting bench processes');
        await execPromise(
          command,
          [...commonArgs, 'exec', '-d', 'frappe', 'bench', 'start'],
          bench.path,
          (out) => context.log('info', out, 'run'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        context.completeStep('run', 'Bench processes started');
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
    run: async (context) => {
      const removeBenchDirectoryBestEffort = async () => {
        context.startStep('fs', 'Removing bench directory');
        try {
          if (fs.existsSync(bench.path)) {
            await fs.promises.rm(bench.path, { recursive: true, force: true });
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
              runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS },
              { info: (msg) => context.log('info', msg, 'stop'), warn: (msg) => context.log('warning', msg, 'stop') }
            );
          };

          try {
            const { code, stderr } = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'stop'), runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS });
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
                  const retryResult = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'stop'), runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS });
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
    { idleTimeout: 60000 },
    { info: () => {}, warn: (msg) => logger.warn(msg) }
  );
};
