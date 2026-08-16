import type { AppHealthResponse, BenchCreateInput, BenchListItem, BenchUpdateInput, CatalogAppItem, LifecycleLogItem, SettingsItem, SiteCreateInput, SiteListItem, SiteUpdateInput, SystemResources, UpdateCheckResult } from '@frappe-local/shared/core';
import type { DiagnosticsReport, TaskProgressEvent } from '@frappe-local/shared/domain';
import { APP_CATALOG_SEED_VERSION, FRAPPE_LOCAL_MACHINE_NAME, ensureRuntimeRunning, extractCustomApp, fetchBreweryCatalog, getDefaultAppCatalogSeed, getLastDiagnosticsReport, getLastRuntimeError, getRuntimeEnv, getTaskRunner, orchestrateBenchAppChanges, orchestrateBenchBuild, orchestrateBenchCleaning, orchestrateBenchCreation, orchestrateBenchDeletion, orchestrateBenchStart, orchestrateBenchStop, orchestrateSiteAppsUpdate, orchestrateSiteCreation, orchestrateSiteDeletion, resetAllBenchContainers, runDiagnostics, syncAppCatalogFromBrewery, type TaskExecutionContext } from '@frappe-local/main/services';

import { getPodmanMachines, isPodmanMachineRequired } from '@frappe-local/main/utils/podman';
import { filterNonCoreApps, getRecommendedPodmanMemoryMb, ipcChannels } from '@frappe-local/shared/core';
import { DEFAULT_HTTP_PORT, execPromise, findNextAvailableTcpPort, getBinaryPath, resolveBenchHttpPort } from '@frappe-local/main/utils';

import { createMainLogger } from '@frappe-local/main/logger';

import { normalizeSiteHost } from '@frappe-local/shared/utils/site-hostname';

const mainLogger = createMainLogger('ipc');

import type { AppRuntimePaths } from '@frappe-local/main/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BrowserWindow, dialog, nativeTheme } from 'electron';
import { CreateBenchInputSchema, CreateCustomAppInputSchema, CreateSiteInputSchema, DEFAULT_SETTINGS, MIN_PODMAN_MEMORY_MB, SettingsSchema, UpdateBenchInputSchema, UpdateCustomAppInputSchema, UpdateSiteInputSchema, canTransitionSiteStatus, isBenchReadyForSiteStatus, type Bench, type CreateCustomAppInput, type CustomAppItem, type Settings, type Site, type UpdateCustomAppInput } from '@frappe-local/shared/domain';

import { createDefaultStorageSnapshot } from '@frappe-local/main/storage';
import type { LifecycleOperation } from '@frappe-local/main/services';

import { configureUpdater, triggerManualUpdateCheck, triggerUpdateDownload, triggerUpdateInstall } from '@frappe-local/main/updater';

type IpcMainLike = {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
};

type TaskRunnerLike = {
  onEvent?: (listener: (event: TaskProgressEvent) => void) => () => void;
  configureLogDirectory?: (logDirectory: string | null) => void;
  enqueue: (definition: { name: string; resource: { type: 'bench' | 'site' | 'runtime' | 'system'; id: string }; run: (context: TaskExecutionContext) => Promise<void> }) => string;
  cancelTask?: (taskId: string) => boolean;
};

const resolveUserPath = (untrimmedPath: string): string => {
  if (typeof untrimmedPath !== 'string') {
    return '';
  }
  const trimmedPath = untrimmedPath.trim();
  if (trimmedPath.startsWith('~')) {
    return path.join(os.homedir(), trimmedPath.slice(1));
  }

  return path.resolve(trimmedPath);
};

const deriveUsedBenchPorts = (benches: Bench[]): Set<number> => {
  return new Set(
    benches
      .map((bench) => bench.httpPort ?? DEFAULT_HTTP_PORT)
      .filter((port) => Number.isInteger(port) && port >= 1024 && port <= 65535)
  );
};

export type IpcRepositories = {
  readonly appCatalog: {
    findAll: () => Promise<CatalogAppItem[]>;
    sync?: (apps: CatalogAppItem[]) => Promise<void>;
    findById?: (id: string) => Promise<CatalogAppItem | null>;
    search?: (query: string) => Promise<CatalogAppItem[]>;
  };
  readonly benches: {
    findAll: () => Promise<Bench[]>;
    findById: (id: string) => Promise<Bench | null>;
    create: (input: BenchCreateInput & { status: 'queued' | 'running' | 'stopped'; apps: string[] }) => Promise<Bench>;
    update: (id: string, input: Partial<BenchUpdateInput>) => Promise<Bench | null>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly sites: {
    findAll: () => Promise<Site[]>;
    findById: (id: string) => Promise<Site | null>;
    create: (input: SiteCreateInput & { status: 'queued' | 'ready' | 'failure'; path: string }) => Promise<Site>;
    update: (id: string, input: Partial<SiteUpdateInput>) => Promise<Site | null>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly settings: {
    findAll?: () => Promise<Settings[]>;
    update?: (input: Partial<Settings>) => Promise<Settings>;
    get?: () => Promise<Settings | null>;
    set?: (input: Partial<Settings>) => Promise<Settings>;
  };
  readonly customApps: {
    findAll: () => Promise<CustomAppItem[]>;
    findById: (id: string) => Promise<CustomAppItem | null>;
    create: (input: CreateCustomAppInput) => Promise<CustomAppItem>;
    update: (id: string, input: UpdateCustomAppInput) => Promise<CustomAppItem | null>;
    delete: (id: string) => Promise<boolean>;
  };
};

export type IpcOperations = {
  openPath: (targetPath: string) => Promise<boolean>;
  openInEditor: (targetPath: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  pathExists: (targetPath: string) => boolean;
  isFrontDoorAvailable?: () => boolean;
  isFrontDoorSecure?: () => boolean;
  refreshFrontDoorHosts?: () => Promise<void>;
  applyRuntimeMemory?: (memoryMb: number) => Promise<void>;
  installWslTask?: (context: import('@frappe-local/main/services/task-runner').TaskExecutionContext) => Promise<void>;
  trackBenchOperation?: (benchId: string, operation: LifecycleOperation) => void;
  trackSiteOperation?: (siteId: string, operation: LifecycleOperation) => void;
};

export type AppRepositories = IpcRepositories;

const toBenchListItem = (bench: Bench): BenchListItem => ({
  id: bench.id,
  name: bench.name,
  path: bench.path,
  frappeVersion: bench.frappeVersion,
  httpPort: bench.httpPort,
  status: bench.status,
  appCount: filterNonCoreApps(bench.apps).length,
  apps: bench.apps,
  createdAt: bench.timestamps.createdAt,
  updatedAt: bench.timestamps.updatedAt,
});

const toSiteListItem = (site: Site): SiteListItem => ({
  id: site.id,
  name: site.name,
  benchId: site.benchId,
  status: site.status,
  path: site.path,
  appCount: filterNonCoreApps(site.apps).length,
  apps: site.apps,
  createdAt: site.timestamps.createdAt,
  updatedAt: site.timestamps.updatedAt,
});

const byCreatedAtDesc = <T extends { timestamps: { createdAt: string } }>(left: T, right: T): number =>
  right.timestamps.createdAt.localeCompare(left.timestamps.createdAt);

const hasDuplicateSiteHost = (
  sites: Site[],
  candidateName: string,
  excludeSiteId?: string
): boolean => {
  const candidateHost = normalizeSiteHost(candidateName);
  if (!candidateHost) {
    return false;
  }

  return sites.some((site) => {
    if (excludeSiteId && site.id === excludeSiteId) {
      return false;
    }

    return normalizeSiteHost(site.name) === candidateHost;
  });
};

const toSettingsItem = (settings: Settings): SettingsItem => ({
  defaultFrappeVersion: settings.defaultFrappeVersion,
  storagePath: settings.storagePath,
  editorPreference: settings.editorPreference,
  terminalPreference: settings.terminalPreference,
  updateChannel: settings.updateChannel,
  autoUpdateEnabled: settings.autoUpdateEnabled,
  sidebarCompact: settings.sidebarCompact,
  podmanMemoryMb: settings.podmanMemoryMb,
  shareSshKeys: settings.shareSshKeys,
  theme: settings.theme,
  breweryUrl: settings.breweryUrl,
});

const toLifecycleLogs = (
  entityId: string,
  entityName: string,
  status: 'queued' | 'running' | 'stopped' | 'success' | 'failure' | 'ready',
  path: string,
  createdAt: string,
  updatedAt: string
): LifecycleLogItem[] => {
  const logs: LifecycleLogItem[] = [
    {
      id: `${entityId}-created`,
      entityId,
      level: 'info',
      message: `Entity "${entityName}" created at ${path}`,
      timestamp: createdAt,
    },
    {
      id: `${entityId}-status-${status}`,
      entityId,
      level: 'info',
      message: `Status of "${entityName}" updated to ${status}`,
      timestamp: updatedAt,
    },
  ];

  return logs;
};

const getCurrentSettings = async (repository: AppRepositories['settings']): Promise<Settings | null> => {
  if (repository.get) {
    return repository.get();
  }

  const settings = await repository.findAll?.();
  return settings?.[0] ?? null;
};

const updateSettings = async (
  repository: AppRepositories['settings'],
  input: Partial<Settings>
): Promise<Settings> => {
  if (repository.update) {
    return repository.update(input);
  }

  if (repository.set) {
    return repository.set(input);
  }

  throw new Error('Settings repository does not support updates.');
};

export const registerIpcHandlers = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations = {
    openPath: async () => false,
    openInEditor: async () => false,
    openExternal: async () => false,
    pathExists: (targetPath) => fs.existsSync(targetPath),
    isFrontDoorAvailable: () => false,
    isFrontDoorSecure: () => false,
    refreshFrontDoorHosts: async () => undefined,
    trackBenchOperation: () => undefined,
    trackSiteOperation: () => undefined,
  },
  taskRunner: TaskRunnerLike = getTaskRunner(),

  appVersion: string = '0.1.0',
  runtimePaths: AppRuntimePaths = {
    userDataPath: '',
    logsPath: '',
    storagePath: '',
    configPath: '',
  }
) => {
  taskRunner.configureLogDirectory?.(runtimePaths.logsPath || null);

  ipcMainLike.handle(ipcChannels.appHealthCheck, async (): Promise<AppHealthResponse> => {
    return {
      appName: 'Frappe Local',
      platform: process.platform,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      timestamp: new Date().toISOString(),
    };
  });

  ipcMainLike.handle(ipcChannels.runtimeFix, async (_event: unknown, checkType: unknown): Promise<boolean> => {
    if (typeof checkType !== 'string') return false;

    if (checkType === 'system-restart') {
      mainLogger.info('Triggering system restart...');
      await execPromise('shutdown', ['/r', '/t', '0']);
      return true;
    }

    if (checkType === 'wsl' || checkType === 'Windows Subsystem for Linux (WSL2)' || checkType === 'Windows Subsystem') {
      mainLogger.info('Triggering elevated WSL installation task...');
      if (!operations.installWslTask) return false;
      await taskRunner.enqueue({
        name: 'install-wsl',
        resource: { type: 'system', id: 'wsl' },
        run: async (ctx) => {
          await operations.installWslTask!(ctx);
        }
      });
      return true;
    }

    if (checkType !== 'runtime-health') return false;

    mainLogger.info('Attempting to fix runtime issues via unified service...');
    const fixed = await ensureRuntimeRunning();
    if (!fixed) {
      throw new Error(getLastRuntimeError() || 'Podman could not be initialized or started.');
    }
    return true;
  });

  ipcMainLike.handle(ipcChannels.frontDoorStatus, async () => {
    return {
      available: operations.isFrontDoorAvailable?.() ?? false,
      secure: operations.isFrontDoorSecure?.() ?? false,
    };
  });

  ipcMainLike.handle(ipcChannels.taskRunnerSubscribe, async () => {
    return true;
  });

  ipcMainLike.handle(ipcChannels.taskRunnerUnsubscribe, async () => {
    return true;
  });

  ipcMainLike.handle(ipcChannels.taskRunnerCancelTask, async (_event: unknown, taskId: unknown): Promise<boolean> => {
    if (typeof taskId !== 'string' || !taskId) return false;
    return taskRunner.cancelTask ? taskRunner.cancelTask(taskId) : false;
  });

  ipcMainLike.handle(ipcChannels.taskRunnerReadLog, async (_event: unknown, taskId: unknown): Promise<string> => {
    if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(taskId)) {
      throw new Error('Invalid task id.');
    }

    if (!runtimePaths.logsPath) {
      return '';
    }

    const logPath = path.join(runtimePaths.logsPath, 'tasks', `${taskId}.log`);
    try {
      return await fs.promises.readFile(logPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  });

  // Event Forwarding for TaskRunner
  taskRunner.onEvent?.((event) => {
    const windows = BrowserWindow?.getAllWindows?.() ?? [];
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(ipcChannels.taskRunnerProgressEvent, event);
      }
    });
  });

  ipcMainLike.handle(ipcChannels.utilsCheckGithubRepoVisibility, async (_event: unknown, url: unknown): Promise<boolean> => {
    if (typeof url !== 'string' || !url) return false;
    try {
      // Basic extraction of owner/repo from various formats:
      let checkUrl = url;
      if (url.startsWith('https://github.com/')) {
        checkUrl = url.replace(/\.git$/, '');
      } else if (url.startsWith('git@github.com:')) {
        checkUrl = `https://github.com/${url.substring(15).replace(/\.git$/, '')}`;
      } else {
        return false;
      }
      
      const response = await fetch(checkUrl, { method: 'HEAD' });
      // GitHub returns 200 for public repos, 404/401 for private or non-existent
      return response.status === 200;
    } catch {
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.diagnosticsRun, async (): Promise<DiagnosticsReport> => {
    const report = await runDiagnostics({
      runtimePaths,
      settingsRepository: {
        get: async () => getCurrentSettings(repositories.settings),
      },
      appVersion,
    });

    if (report.hasCriticalIssues) {
      const benches = await repositories.benches.findAll();
      for (const bench of benches) {
        if (bench.status === 'running' || bench.status === 'queued') {
          await repositories.benches.update(bench.id, { status: 'stopped' });
        }
      }
    }

    return report;
  });

  ipcMainLike.handle(ipcChannels.diagnosticsGetLast, async (): Promise<DiagnosticsReport | null> => {
    return getLastDiagnosticsReport();
  });

  ipcMainLike.handle(ipcChannels.diagnosticsResetDevState, async (): Promise<boolean> => {
    mainLogger.info('RESET initiated. Evaluating system state...');
    const benches = await repositories.benches.findAll();
    let podmanMachineRemovalError: Error | null = null;

    let hasPodmanMachine = false;
    if (isPodmanMachineRequired()) {
      try {
        const machines = await getPodmanMachines();
        hasPodmanMachine = machines.some((m) => m.Name === FRAPPE_LOCAL_MACHINE_NAME);
      } catch (error) {
        mainLogger.warn(`Failed to inspect Podman machine status during reset evaluation: ${error}`);
      }
    }

    // On native Linux (!isPodmanMachineRequired()), Podman runs directly on the host OS,
    // so we must explicitly tear down containers and volumes.
    // On Mac/Windows (isPodmanMachineRequired()), all containers live inside the dedicated VM;
    // destroying the VM obliterates all containers and volumes instantly.
    const shouldCleanContainers = !isPodmanMachineRequired();

    if (shouldCleanContainers) {
      let runtimeEnv: NodeJS.ProcessEnv | undefined;
      try {
        const runtimeReady = await ensureRuntimeRunning();
        if (runtimeReady) {
          runtimeEnv = await getRuntimeEnv();
        }
      } catch (error) {
        mainLogger.warn(`Runtime not available during reset operation: ${error}`);
      }

      if (runtimeEnv) {
        mainLogger.info('RESET Cleaning: Resetting bench containers and orphaned podman resources...');
        await resetAllBenchContainers(benches, runtimeEnv, mainLogger);
      }
    } else {
      mainLogger.info(`RESET Evaluation: Skipping container teardown (on VM platforms, destroying VM '${FRAPPE_LOCAL_MACHINE_NAME}' wipes all containers).`);
    }

    // Remove all bench folders and their sites from the filesystem
    if (benches.length > 0) {
      mainLogger.info(`RESET Cleaning: Evaluating ${benches.length} recorded bench folder(s) for removal...`);
      for (const bench of benches) {
        try {
          if (fs.existsSync(bench.path)) {
            await fs.promises.rm(bench.path, { recursive: true, force: true });
            mainLogger.info(`Removed bench folder: ${bench.path}`);
          } else {
            mainLogger.info(`RESET Evaluation: Bench folder already skipped (not found on disk): ${bench.path}`);
          }
        } catch (error) {
          mainLogger.warn(`Failed to remove bench folder ${bench.path}: ${error}`);
        }
      }
    } else {
      mainLogger.info('RESET Evaluation: Skipping recorded bench folders removal (no benches in database).');
    }

    const settings = await getCurrentSettings(repositories.settings);
    const managedBenchesDirectories = new Set([
      path.join(runtimePaths.userDataPath, 'benches'),
      ...(settings?.storagePath
        ? [path.join(resolveUserPath(settings.storagePath), 'benches')]
        : []),
    ]);

    for (const benchesDir of managedBenchesDirectories) {
      try {
        if (fs.existsSync(benchesDir)) {
          await fs.promises.rm(benchesDir, { recursive: true, force: true });
          mainLogger.info(`Removed dormant benches folder: ${benchesDir}`);
        } else {
          mainLogger.info(`RESET Evaluation: Dormant benches folder already skipped (not found): ${benchesDir}`);
        }
      } catch (error) {
        mainLogger.warn(`Failed to remove benches folder ${benchesDir}: ${error}`);
      }
    }

    if (isPodmanMachineRequired()) {
      if (hasPodmanMachine) {
        try {
          mainLogger.info(`Destroying dedicated podman machine: ${FRAPPE_LOCAL_MACHINE_NAME}`);
          const result = await execPromise(
            getBinaryPath('podman'),
            ['machine', 'rm', '--force', FRAPPE_LOCAL_MACHINE_NAME]
          );
          if (result.code !== 0) {
            const reason = (result.stderr || result.stdout).trim() || `exit code ${result.code}`;
            throw new Error(reason);
          }
          mainLogger.info(`Successfully destroyed podman machine: ${FRAPPE_LOCAL_MACHINE_NAME}`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          podmanMachineRemovalError = new Error(
            `Failed to destroy Podman machine '${FRAPPE_LOCAL_MACHINE_NAME}': ${reason}`
          );
          mainLogger.warn(podmanMachineRemovalError.message);
        }
      } else {
        mainLogger.info(`RESET Evaluation: Skipping podman machine destruction (machine '${FRAPPE_LOCAL_MACHINE_NAME}' does not exist).`);
      }
    }

    await fs.promises.rm(runtimePaths.storagePath, { recursive: true, force: true });
    await fs.promises.rm(runtimePaths.configPath, { recursive: true, force: true });
    await fs.promises.mkdir(runtimePaths.storagePath, { recursive: true });

    const snapshot = createDefaultStorageSnapshot(getDefaultAppCatalogSeed(), APP_CATALOG_SEED_VERSION);
    const storageFilePath = path.join(runtimePaths.storagePath, 'storage.json');
    fs.writeFileSync(storageFilePath, JSON.stringify(snapshot, null, 2), 'utf8');

    try {
      await operations.refreshFrontDoorHosts?.();
    } catch (error) {
      mainLogger.warn(`Failed to refresh front door hosts after reset: ${error}`);
    }

    if (podmanMachineRemovalError) {
      throw podmanMachineRemovalError;
    }

    mainLogger.info('RESET completed successfully.');
    return true;
  });

  ipcMainLike.handle(ipcChannels.benchesPickFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Bench Directory',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMainLike.handle(ipcChannels.benchesList, async () => {
    const benches = await repositories.benches.findAll();
    return [...benches].sort(byCreatedAtDesc).map(toBenchListItem);
  });

  ipcMainLike.handle(ipcChannels.benchesCreate, async (_event: unknown, input: unknown) => {
    const rawInput = input as BenchCreateInput;
    const { siteName, ...benchPayload } = CreateBenchInputSchema.parse({
      ...rawInput,
      path: resolveUserPath(rawInput.path),
    });
    const normalizedApps = Array.from(new Set(['frappe', ...benchPayload.apps.map(a => a.trim()).filter(Boolean)]));

    const existingSites = await repositories.sites.findAll();
    const duplicateSite = existingSites.find(s => normalizeSiteHost(s.name) === normalizeSiteHost(siteName));
    if (duplicateSite) {
      throw new Error(`A site host "${normalizeSiteHost(siteName)}" already exists. Use a unique initial site name.`);
    }

    const existingBenches = await repositories.benches.findAll();
    const usedPorts = deriveUsedBenchPorts(existingBenches);
    const requestedPort = benchPayload.httpPort;
    const startPort = requestedPort ?? DEFAULT_HTTP_PORT;
    const httpPort = await findNextAvailableTcpPort(startPort, usedPorts);

    const created = await repositories.benches.create({
      ...benchPayload,
      siteName,
      status: 'queued', // Initial state should be queued
      apps: normalizedApps,
      httpPort,
    });

    const settings = await getCurrentSettings(repositories.settings);
    operations.trackBenchOperation?.(created.id, 'create');
    orchestrateBenchCreation(
      created,
      repositories.benches,
      repositories.appCatalog,
      repositories.customApps,
      settings?.shareSshKeys ?? false,
      {
        siteName,
        siteRepo: repositories.sites,
        onCompleted: async () => {
          await operations.refreshFrontDoorHosts?.();
        }
      }
    );

    return toBenchListItem(created);
  });

  ipcMainLike.handle(ipcChannels.benchesUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    const rawInput = input as BenchUpdateInput;
    const payload = UpdateBenchInputSchema.parse({
      ...rawInput,
      ...(typeof rawInput.path === 'string' ? { path: resolveUserPath(rawInput.path) } : {}),
    });

    const benches = await repositories.benches.findAll();
    const existing = benches.find(b => b.id === id);
    if (!existing) {
      return null;
    }

    const requestedApps = Array.isArray(payload.apps)
      ? Array.from(new Set(['frappe', ...payload.apps]))
      : undefined;
    const appsChanged = Array.isArray(requestedApps) && requestedApps.join('\u0000') !== existing.apps.join('\u0000');
    const deferAppsPersistence = appsChanged && existing.status === 'running' && !payload.status;

    const { status: targetStatus, apps: _ignoredApps, ...otherUpdates } = payload;
    void _ignoredApps;
    const persistedUpdates = deferAppsPersistence
      ? otherUpdates
      : {
          ...otherUpdates,
          ...(Array.isArray(requestedApps) ? { apps: requestedApps } : {}),
        };

    let updated = Object.keys(persistedUpdates).length > 0
      ? await repositories.benches.update(id, persistedUpdates)
      : existing;

    if (!updated) {
      return null;
    }

    operations.trackBenchOperation?.(updated.id, 'update');

    if (targetStatus && (targetStatus !== existing.status || targetStatus === 'running')) {
      const status = targetStatus;
      // Do not allow conflicting lifecycle requests while transition is already queued.
      if (existing.status === 'queued') {
        mainLogger.info(`Ignoring bench status change while queued. benchId=${id} target=${status}`);
        return toBenchListItem(updated);
      }

      // Set to queued in DB immediately so UI shows pending state.
      updated = (await repositories.benches.update(id, { status: 'queued' })) ?? updated;

      if (status === 'running') {
        const isRestart = existing.status === 'running';
        const settings = await getCurrentSettings(repositories.settings);
        orchestrateBenchStart(updated, repositories.benches, repositories.customApps, settings?.shareSshKeys ?? false, isRestart);
      } else if (status === 'stopped') {
        orchestrateBenchStop(updated, repositories.benches);
      }
    } else if (targetStatus !== undefined) {
      // Normal status update without orchestration.
      updated = (await repositories.benches.update(id, { status: targetStatus })) ?? updated;
    }

    if (appsChanged && existing.status === 'running' && !targetStatus) {
      const requestedApps = (input as BenchUpdateInput).apps;
      const settings = await getCurrentSettings(repositories.settings);
      orchestrateBenchAppChanges(updated, repositories.benches, repositories.appCatalog, repositories.customApps, settings?.shareSshKeys ?? false, existing.apps, requestedApps ?? []);
    }

    return toBenchListItem(updated);
  });

  ipcMainLike.handle(ipcChannels.benchesDelete, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const bench = await repositories.benches.findById(id);
    if (!bench) {
      return false;
    }

    orchestrateBenchDeletion(bench, repositories.benches, repositories.sites, {
      onDeleted: async () => {
        await operations.refreshFrontDoorHosts?.();
      },
    });

    operations.trackBenchOperation?.(id, 'delete');
    return true;
  });

  ipcMainLike.handle(ipcChannels.benchesLogs, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return [];
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench) {
      return [];
    }

    const logs = toLifecycleLogs(
      bench.id,
      bench.name,
      bench.status,
      bench.path,
      bench.timestamps.createdAt,
      bench.timestamps.updatedAt
    );
    operations.trackBenchOperation?.(bench.id, 'logs-read');
    return logs;
  });

  ipcMainLike.handle(ipcChannels.benchesOpenFolder, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || !fs.existsSync(bench.path)) {
      return false;
    }

    const opened = await operations.openPath(bench.path);
    if (opened) {
      operations.trackBenchOperation?.(bench.id, 'open-folder');
    }
    return opened;
  });

  ipcMainLike.handle(ipcChannels.benchesOpenShell, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || !fs.existsSync(bench.path)) {
      return false;
    }

    if (bench.status !== 'running') {
      mainLogger.warn(`Cannot open shell for bench ${bench.name}: bench is not running.`);
      return false;
    }

    try {
      const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
      const { openBenchShell } = await import('@frappe-local/main/utils');
      const projectName = getComposeProjectName(bench.id);
      const runtimeEnv = await getRuntimeEnv();
      const settings = await getCurrentSettings(repositories.settings);
      await openBenchShell(bench.path, projectName, runtimeEnv, settings?.terminalPreference || 'default');
      operations.trackBenchOperation?.(bench.id, 'open-folder'); // Optional: reuse this or add new 'open-shell'
      return true;
    } catch (error) {
      mainLogger.error(`Failed to open shell for bench ${bench.name}:`, error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.benchesOpenInEditor, async (_event: unknown, id: unknown, inContainer: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || !fs.existsSync(bench.path)) {
      return false;
    }

    if (!inContainer) {
      const opened = await operations.openInEditor(bench.path);
      if (opened && bench.id) operations.trackBenchOperation?.(bench.id, 'open-folder');
      return opened;
    }

    try {
      const { ensureBenchDevcontainer } = await import('@frappe-local/main/services/bench-orchestration');
      const { execPromise, getBinaryPath, resolveEditorCommand } = await import('@frappe-local/main/utils');
      const { getRuntimeEnv } = await import('@frappe-local/main/services/runtime-service');
      const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
      const runtimeEnv: Record<string, string | undefined> = await getRuntimeEnv().catch(() => ({} as Record<string, string | undefined>));
      await ensureBenchDevcontainer(bench.path, { log: () => {} }, 'open-editor', runtimeEnv, bench.id);
      const hexPath = Buffer.from(bench.path, 'utf8').toString('hex');
      const uri = `vscode-remote://dev-container+${hexPath}/workspace`;
      const devcontainerBinDir = path.join(bench.path, '.devcontainer', 'bin');
      const podmanBinDir = path.dirname(getBinaryPath('podman'));
      const { command: codeCmd, env: editorEnv } = resolveEditorCommand('code');
      const combinedPath = `${devcontainerBinDir}${path.delimiter}${podmanBinDir}${path.delimiter}${editorEnv.PATH || process.env.PATH || ''}`;
      const composeProjectName = getComposeProjectName(bench.id);
      const execEnv = { ...process.env, ...runtimeEnv, CONTAINER_HOST: runtimeEnv['DOCKER_HOST'] || process.env['DOCKER_HOST'] || process.env['CONTAINER_HOST'] || '', COMPOSE_PROJECT_NAME: composeProjectName, PATH: combinedPath };
      await execPromise(codeCmd, ['--folder-uri', uri], bench.path, undefined, execEnv);
      if (bench.id) operations.trackBenchOperation?.(bench.id, 'open-folder');
      return true;
    } catch (error) {
      mainLogger.error(`Failed to open Dev Container for bench ${bench.name}:`, error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.appsOpenInEditor, async (_event: unknown, benchId: unknown, appName: unknown, inContainer: unknown) => {
    if (typeof appName !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    let bench = typeof benchId === 'string' ? benches.find((b) => b.id === benchId) ?? null : null;

    const customApps = await repositories.customApps.findAll();
    const customApp = customApps.find((a) => a.id === appName || a.name === appName || a.title === appName);

    if (!bench) {
      const possibleIdentifiers = new Set([appName, customApp?.name, customApp?.id].filter(Boolean) as string[]);
      bench = benches.find((b) => (inContainer ? b.status === 'running' : true) && b.apps?.some((a) => possibleIdentifiers.has(a))) ?? null;
      if (!bench && inContainer) {
        bench = benches.find((b) => b.apps?.some((a) => possibleIdentifiers.has(a))) ?? null;
      }
      if (!bench) {
        bench = benches.find((b) => {
          if (!fs.existsSync(path.join(b.path, 'apps'))) return false;
          const dirs = fs.readdirSync(path.join(b.path, 'apps'));
          return dirs.some((d) => possibleIdentifiers.has(d) || dirs.some((dir) => dir.replace(/[-_]/g, '').toLowerCase() === (customApp?.name || appName).replace(/[-_]/g, '').toLowerCase()));
        }) ?? null;
      }
    }

    if (!inContainer && customApp && customApp.type === 'local' && customApp.source && fs.existsSync(customApp.source)) {
      return operations.openInEditor(customApp.source);
    }

    if (!bench) {
      if (inContainer) {
        mainLogger.warn(`Cannot open Dev Container for app ${appName}: no bench found with this app.`);
      }
      return false;
    }

    let folderName = customApp?.name || appName;
    if (fs.existsSync(path.join(bench.path, 'apps'))) {
      const dirs = fs.readdirSync(path.join(bench.path, 'apps'));
      const target = dirs.find((d) => d === customApp?.name || d === appName)
        || dirs.find((d) => d.toLowerCase() === (customApp?.name || appName).toLowerCase())
        || dirs.find((d) => d.replace(/[-_]/g, '').toLowerCase() === (customApp?.name || appName).replace(/[-_]/g, '').toLowerCase());
      if (target) {
        folderName = target;
      }
    }

    if (inContainer) {
      try {
        const { ensureBenchDevcontainer } = await import('@frappe-local/main/services/bench-orchestration');
        const { execPromise, getBinaryPath, resolveEditorCommand } = await import('@frappe-local/main/utils');
        const { getRuntimeEnv } = await import('@frappe-local/main/services/runtime-service');
        const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
        const runtimeEnv: Record<string, string | undefined> = await getRuntimeEnv().catch(() => ({} as Record<string, string | undefined>));
        await ensureBenchDevcontainer(bench.path, { log: () => {} }, 'open-editor', runtimeEnv, bench.id);
        const hexPath = Buffer.from(bench.path, 'utf8').toString('hex');
        const uri = `vscode-remote://dev-container+${hexPath}/workspace/apps/${folderName}`;
        const devcontainerBinDir = path.join(bench.path, '.devcontainer', 'bin');
        const podmanBinDir = path.dirname(getBinaryPath('podman'));
        const { command: codeCmd, env: editorEnv } = resolveEditorCommand('code');
        const combinedPath = `${devcontainerBinDir}${path.delimiter}${podmanBinDir}${path.delimiter}${editorEnv.PATH || process.env.PATH || ''}`;
        const composeProjectName = getComposeProjectName(bench.id);
        const execEnv = { ...process.env, ...runtimeEnv, CONTAINER_HOST: runtimeEnv['DOCKER_HOST'] || process.env['DOCKER_HOST'] || process.env['CONTAINER_HOST'] || '', COMPOSE_PROJECT_NAME: composeProjectName, PATH: combinedPath };
        await execPromise(codeCmd, ['--folder-uri', uri], bench.path, undefined, execEnv);
        if (bench.id) operations.trackBenchOperation?.(bench.id, 'open-folder');
        return true;
      } catch (error) {
        mainLogger.error(`Failed to open Dev Container for app ${appName}:`, error);
        return false;
      }
    }

    const appFolderPath = path.join(bench.path, 'apps', folderName);
    if (fs.existsSync(appFolderPath)) {
      return operations.openInEditor(appFolderPath);
    }

    return false;
  });
  ipcMainLike.handle(ipcChannels.benchesBuild, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || bench.status !== 'running') {
      return false;
    }

    try {
      orchestrateBenchBuild(bench);
      return true;
    } catch (error) {
      mainLogger.error('Failed to orchestrate bench build:', error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.benchesCleanSites, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || bench.status !== 'running') {
      return false;
    }

    taskRunner.enqueue({
      name: `Clean Bench: ${bench.name}`,
      resource: { type: 'bench', id: bench.id },
      run: async () => {
        try {
          await orchestrateBenchCleaning(bench, repositories.sites);
        } catch (error) {
          mainLogger.error('Failed to clean bench:', error);
          throw error;
        }
      },
    });

    operations.trackBenchOperation?.(id, 'update');
    return true;
  });

  ipcMainLike.handle(ipcChannels.catalogList, async () => {
    return repositories.appCatalog.findAll();
  });

  ipcMainLike.handle(ipcChannels.catalogFindById, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    if (repositories.appCatalog.findById) {
      return repositories.appCatalog.findById(id);
    }

    const apps = await repositories.appCatalog.findAll();
    return apps.find((app) => app.id === id) ?? null;
  });

  ipcMainLike.handle(ipcChannels.catalogSearch, async (_event: unknown, query: unknown) => {
    if (typeof query !== 'string') {
      return [];
    }

    if (repositories.appCatalog.search) {
      return repositories.appCatalog.search(query);
    }

    const normalized = query.trim().toLowerCase();
    const apps = await repositories.appCatalog.findAll();
    if (!normalized) {
      return apps;
    }

    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(normalized) ||
        app.description.toLowerCase().includes(normalized)
    );
  });

  ipcMainLike.handle(ipcChannels.catalogSync, async (_event: unknown, apps: unknown) => {
    if (!Array.isArray(apps) || !repositories.appCatalog.sync) {
      return false;
    }

    await repositories.appCatalog.sync(apps as CatalogAppItem[]);
    return true;
  });

  ipcMainLike.handle(ipcChannels.catalogValidateBrewery, async (_event: unknown, url: unknown) => {
    const targetUrl = typeof url === 'string' ? url : undefined;
    const result = await fetchBreweryCatalog(targetUrl);
    if (result.success) {
      return { valid: true, appCount: result.apps.length };
    }
    return { valid: false, error: result.error };
  });

  ipcMainLike.handle(ipcChannels.catalogSyncBrewery, async (_event: unknown, url: unknown) => {
    const targetUrl = typeof url === 'string' ? url : undefined;
    if (!repositories.appCatalog.sync) {
      return { success: false, error: 'Catalog repository sync unavailable' };
    }
    const result = await syncAppCatalogFromBrewery(targetUrl, repositories.appCatalog);
    if (result.success) {
      return { success: true, appCount: result.apps.length };
    }
    return { success: false, error: result.error };
  });

  ipcMainLike.handle(ipcChannels.sitesList, async () => {
    const sites = await repositories.sites.findAll();
    return [...sites].sort(byCreatedAtDesc).map(toSiteListItem);
  });

  ipcMainLike.handle(ipcChannels.sitesCreate, async (_event: unknown, input: unknown) => {
    const payload = CreateSiteInputSchema.parse(input as SiteCreateInput);
    const existingSites = await repositories.sites.findAll();
    const duplicateSite = existingSites.find(s => normalizeSiteHost(s.name) === normalizeSiteHost(payload.name));
    if (duplicateSite) {
      throw new Error(`A site host "${normalizeSiteHost(payload.name)}" already exists. Use a unique site name.`);
    }

    const bench = await repositories.benches.findById(payload.benchId);
    if (!bench) {
      throw new Error('Cannot create site: parent bench was not found.');
    }
    if (bench.status !== 'running') {
      throw new Error(`Cannot create site. Bench "${bench.name}" is not running. Please start the bench first.`);
    }

    const customAppsList = await repositories.customApps.findAll();
    const isAppOnBench = (app: string) => {
      if (bench.apps.includes(app)) return true;
      const customApp = customAppsList.find((c) => c.id === app || c.name === app);
      return customApp ? bench.apps.includes(customApp.id) || bench.apps.includes(customApp.name) : false;
    };
    const unavailableApps = filterNonCoreApps(payload.apps).filter((app) => !isAppOnBench(app));
    if (unavailableApps.length > 0) {
      throw new Error(`Cannot create site with apps not installed on bench: ${unavailableApps.join(', ')}`);
    }

    const created = await orchestrateSiteCreation(repositories, payload, {
      onCompleted: async () => {
        await operations.refreshFrontDoorHosts?.();
      },
    });
    operations.trackSiteOperation?.(created.id, 'create');
    return toSiteListItem(created);
  });

  ipcMainLike.handle(ipcChannels.sitesUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    const payload = UpdateSiteInputSchema.parse(input as SiteUpdateInput);

    const sites = await repositories.sites.findAll();
    const existing = sites.find((entry) => entry.id === id);
    if (!existing) {
      return null;
    }
    if (existing.status === 'queued' && payload.status) {
      return toSiteListItem(existing);
    }

    const targetSiteName = payload.name ?? existing.name;
    if (hasDuplicateSiteHost(sites, targetSiteName, existing.id)) {
      throw new Error(`A site host "${normalizeSiteHost(targetSiteName)}" already exists. Use a unique site name.`);
    }

    const targetSiteStatus = payload.status ?? existing.status;
    if (!canTransitionSiteStatus(existing.status, targetSiteStatus)) {
      return null;
    }

    const targetBenchId = payload.benchId ?? existing.benchId;
    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === targetBenchId);
    if (!bench) {
      return null;
    }

    const { status: targetStatus, ...otherUpdates } = payload;
    if (!isBenchReadyForSiteStatus(bench.status, targetSiteStatus)) {
      throw new Error(`Bench "${bench.name}" is not running. Please start the bench before updating its sites.`);
    }

    const requestedApps = Array.isArray(payload.apps)
      ? Array.from(new Set(payload.apps.map((app) => app.trim()).filter(Boolean)))
      : null;

    if (requestedApps) {
      if (existing.status !== 'ready' && existing.status !== 'failure') {
        throw new Error('Site must be ready or in failure state before activating apps.');
      }

      const appsToInstall = requestedApps.filter((app) => !existing.apps.includes(app));
      const removedApps = existing.apps.filter((app) => !requestedApps.includes(app));

      if (appsToInstall.length === 0 && removedApps.length === 0) {
        return toSiteListItem(existing);
      }

      const queuedSite = (await repositories.sites.update(id, { status: 'queued' })) ?? existing;
      operations.trackSiteOperation?.(queuedSite.id, 'update');

      orchestrateSiteAppsUpdate(repositories, existing, requestedApps, {
        onCompleted: async () => {
          await operations.refreshFrontDoorHosts?.();
        },
      });
      return toSiteListItem(queuedSite);
    }

    const { apps: _ignoredApps, ...safeOtherUpdates } = otherUpdates;
    void _ignoredApps;
    let updated = await repositories.sites.update(id, safeOtherUpdates);

    if (updated) {
      operations.trackSiteOperation?.(updated.id, 'update');
      await operations.refreshFrontDoorHosts?.();

      if (targetStatus && targetStatus !== existing?.status) {
        updated = (await repositories.sites.update(id, { status: targetStatus })) ?? updated;
      }
    }
    return updated ? toSiteListItem(updated) : null;
  });

  ipcMainLike.handle(ipcChannels.sitesDelete, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      throw new Error('Invalid site ID provided.');
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site) {
      throw new Error('Site not found.');
    }

    const bench = await repositories.benches.findById(site.benchId);
    if (bench && bench.status !== 'running') {
      throw new Error(`Cannot delete site. Its parent bench "${bench.name}" is not running. Please start the bench first.`);
    }

    const result = await orchestrateSiteDeletion(repositories, id, {
      onDeleted: async () => {
        await operations.refreshFrontDoorHosts?.();
      },
    });
    if (result) {
      operations.trackSiteOperation?.(id, 'delete');
    }
    return result;
  });

  ipcMainLike.handle(ipcChannels.sitesCleanCache, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      throw new Error('Invalid site ID provided.');
    }

    const { orchestrateSiteCleanCache } = await import('@frappe-local/main/services/site-orchestration');
    return orchestrateSiteCleanCache(repositories, id);
  });

  ipcMainLike.handle(ipcChannels.sitesMigrate, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      throw new Error('Invalid site ID provided.');
    }

    const { orchestrateSiteMigrate } = await import('@frappe-local/main/services/site-orchestration');
    return orchestrateSiteMigrate(repositories, id);
  });

  ipcMainLike.handle(ipcChannels.sitesLogs, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return [];
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site) {
      return [];
    }

    const logs = toLifecycleLogs(
      site.id,
      site.name,
      site.status,
      site.path,
      site.timestamps.createdAt,
      site.timestamps.updatedAt
    );
    operations.trackSiteOperation?.(site.id, 'logs-read');
    return logs;
  });

  ipcMainLike.handle(ipcChannels.sitesOpenFolder, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site || !fs.existsSync(site.path)) {
      return false;
    }

    const opened = await operations.openPath(site.path);
    if (opened) {
      operations.trackSiteOperation?.(site.id, 'open-folder');
    }
    return opened;
  });

  ipcMainLike.handle(ipcChannels.sitesOpenShell, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site || !fs.existsSync(site.path)) {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === site.benchId);
    if (!bench || bench.status !== 'running') {
      mainLogger.warn(`Cannot open shell for site ${site.name}: parent bench is not running.`);
      return false;
    }

    try {
      const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
      const { openSiteShell } = await import('@frappe-local/main/utils');
      const projectName = getComposeProjectName(bench.id);
      const runtimeEnv = await getRuntimeEnv();
      const settings = await getCurrentSettings(repositories.settings);
      await openSiteShell(bench.path, projectName, site.name, runtimeEnv, settings?.terminalPreference || 'default');
      operations.trackSiteOperation?.(site.id, 'open-folder'); // Using open-folder or similar
      return true;
    } catch (error) {
      mainLogger.error(`Failed to open shell for site ${site.name}:`, error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.sitesOpenExternal, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site) {
      return false;
    }

    const preferredHost = normalizeSiteHost(site.name);
    const frontDoorAvailable = operations.isFrontDoorAvailable?.() ?? false;
    if (frontDoorAvailable) {
      const protocol = operations.isFrontDoorSecure?.() ? 'https' : 'http';
      return operations.openExternal(`${protocol}://${preferredHost}`);
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === site.benchId);
    const fallbackPort = bench ? resolveBenchHttpPort(bench, DEFAULT_HTTP_PORT) : DEFAULT_HTTP_PORT;
    const url = `http://${preferredHost}:${fallbackPort}`;
    const opened = await operations.openExternal(url);
    if (opened) {
      // open-external is not a valid SiteLifecycleOperation, ignoring track
    }
    return opened;
  });

  ipcMainLike.handle(ipcChannels.settingsGet, async () => {
    const settings = await getCurrentSettings(repositories.settings);
    return settings ? toSettingsItem(settings) : null;
  });

  ipcMainLike.handle(ipcChannels.settingsSet, async (_event: unknown, input: unknown) => {
    const payload = SettingsSchema.partial().parse(input ?? {});
    const totalMemoryMb = Math.max(
      MIN_PODMAN_MEMORY_MB,
      Math.floor(os.totalmem() / (1024 * 1024))
    );
    if (payload.podmanMemoryMb && payload.podmanMemoryMb > totalMemoryMb) {
      throw new Error(`Podman memory cannot exceed system memory (${totalMemoryMb} MB).`);
    }
    const current = await getCurrentSettings(repositories.settings);
    if (
      payload.breweryUrl !== undefined &&
      payload.breweryUrl.trim() !== '' &&
      payload.breweryUrl.trim() !== current?.breweryUrl?.trim()
    ) {
      const validation = await fetchBreweryCatalog(payload.breweryUrl.trim());
      if (!validation.success) {
        throw new Error(
          `Cannot save settings: registry endpoint "${payload.breweryUrl.trim()}" is invalid or failed to fetch apps (${validation.error || 'Could not fetch app catalog from this URL.'})`
        );
      }
    }
    if (
      operations.applyRuntimeMemory &&
      payload.podmanMemoryMb !== undefined &&
      payload.podmanMemoryMb !== current?.podmanMemoryMb
    ) {
      await operations.applyRuntimeMemory(payload.podmanMemoryMb);
    }
    const fullPayload = {
      ...DEFAULT_SETTINGS,
      ...(current || {}),
      ...payload
    };
    const updated = await updateSettings(repositories.settings, fullPayload);
    
    nativeTheme.themeSource = updated.theme ?? 'system';
    
    // dynamically reconfigure updater in case update channel or autoUpdateEnabled changed
    configureUpdater(updated);
    
    if (
      payload.breweryUrl !== undefined &&
      payload.breweryUrl !== current?.breweryUrl &&
      repositories.appCatalog.sync
    ) {
      syncAppCatalogFromBrewery(updated.breweryUrl, { sync: repositories.appCatalog.sync }).catch((err) => {
        mainLogger.warn(`Background brewery catalog sync on settings change failed: ${err}`);
      });
    }
    
    return toSettingsItem(updated);
  });

  ipcMainLike.handle(ipcChannels.systemResourcesGet, (): SystemResources => {
    const totalMemoryMb = Math.max(
      MIN_PODMAN_MEMORY_MB,
      Math.floor(os.totalmem() / (1024 * 1024))
    );
    return {
      totalMemoryMb,
      recommendedPodmanMemoryMb: getRecommendedPodmanMemoryMb(totalMemoryMb),
      podmanMachineRequired: isPodmanMachineRequired(),
    };
  });

  ipcMainLike.handle(ipcChannels.utilsPathExists, async (_event: unknown, targetPath: unknown) => {
    if (typeof targetPath !== 'string') {
      return false;
    }
    return operations.pathExists(resolveUserPath(targetPath));
  });

  ipcMainLike.handle(ipcChannels.utilsOpenExternal, async (_event: unknown, url: unknown) => {
    if (typeof url !== 'string') {
      return false;
    }
    return operations.openExternal(url);
  });

  ipcMainLike.handle(ipcChannels.utilsGetAvailableTerminals, async () => {
    const { detectAvailableTerminals } = await import('@frappe-local/main/utils');
    return await detectAvailableTerminals();
  });

  ipcMainLike.handle(ipcChannels.utilsCheckEditorInstalled, async (_event: unknown, commandName: unknown) => {
    const { isEditorInstalled } = await import('@frappe-local/main/utils');
    const cmd = typeof commandName === 'string' ? commandName : 'code';
    return isEditorInstalled(cmd);
  });

  ipcMainLike.handle(ipcChannels.updateCheckNow, async (): Promise<UpdateCheckResult> => {
    return await triggerManualUpdateCheck();
  });

  ipcMainLike.handle(ipcChannels.updateDownload, async (): Promise<void> => {
    return await triggerUpdateDownload();
  });

  ipcMainLike.handle(ipcChannels.updateInstall, async (): Promise<void> => {
    return await triggerUpdateInstall();
  });

  ipcMainLike.handle(ipcChannels.customAppsList, async () => {
    return repositories.customApps.findAll();
  });

  ipcMainLike.handle(ipcChannels.customAppsCreate, async (_event: unknown, input: unknown) => {
    return repositories.customApps.create(CreateCustomAppInputSchema.parse(input));
  });

  ipcMainLike.handle(ipcChannels.customAppsUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    return repositories.customApps.update(String(id), UpdateCustomAppInputSchema.parse(input));
  });

  ipcMainLike.handle(ipcChannels.customAppsDelete, async (_event: unknown, id: unknown) => {
    return repositories.customApps.delete(id as string);
  });

  ipcMainLike.handle(ipcChannels.customAppsExtract, async (_event: unknown, type: unknown, source: unknown) => {
    return extractCustomApp(type as 'github' | 'local', source as string);
  });

  ipcMainLike.handle(ipcChannels.appsCheckUsage, async (_event: unknown, identifiers: unknown, benchId?: unknown) => {
    const benches = await repositories.benches.findAll();
    const sites = await repositories.sites.findAll();
    
    let usedBenches: string[] = [];
    let usedSites: string[] = [];
    
    const ids = Array.isArray(identifiers) ? identifiers : [identifiers];

    const isAppInList = (appList: string[] | undefined) => {
      if (!appList) return false;
      return appList.some((appName) => ids.includes(appName));
    };
    
    if (benchId) {
      // Check if any site on the specified bench uses this app
      const sitesOnBench = sites.filter(s => s.benchId === benchId);
      usedSites = sitesOnBench.filter(s => isAppInList(s.apps)).map(s => s.name);
    } else {
      // Global check: check all benches and all sites
      usedBenches = benches.filter(b => isAppInList(b.apps)).map(b => b.name);
      usedSites = sites.filter(s => isAppInList(s.apps)).map(s => s.name);
    }
    
    return {
      inUse: usedBenches.length > 0 || usedSites.length > 0,
      benches: usedBenches,
      sites: usedSites,
    };
  });
};
