import type {
  AppHealthResponse,
  BenchCreateInput,
  BenchListItem,
  BenchUpdateInput,
  CatalogAppItem,
  LifecycleLogItem,
  SettingsItem,
  SystemResources,
  SiteCreateInput,
  SiteListItem,
  SiteUpdateInput,
  UpdateCheckResult,
  UpdateStrategyStatus,
} from '../shared/core/ipc';
import type { DiagnosticsReport } from '../shared/domain/diagnostics';
import { runDiagnostics, getLastDiagnosticsReport } from './services/diagnostics-service';
import { ensureRuntimeRunning, getRuntimeEnv, LOCAL_BENCH_MACHINE_NAME } from './services/runtime-service';
import { isPodmanMachineRequired } from './utils/podman/podman';
import { getBinaryPath } from './utils/binaries';
import { execPromise } from './utils/exec';
import { buildUpdateStrategyStatus, runManualUpdateCheck } from './services/update-strategy-service';
import { ipcChannels } from '../shared/core/ipc';
import type { TaskProgressEvent } from '../shared/domain/task-runner';
import { getTaskRunner, type TaskExecutionContext } from './services/task-runner';
import { createMainLogger } from './logger';
import { findNextAvailableTcpPort } from './utils/ports';
import { normalizeSiteHost } from '../shared/utils/site-hostname';
import { withCoreBenchApps } from '../shared/utils/bench-apps';
import { resolveBenchHttpPort, DEFAULT_HTTP_PORT } from './utils/bench-http-port';

const mainLogger = createMainLogger('ipc');

import type { AppRuntimePaths } from './config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BrowserWindow, dialog } from 'electron';
import {
  CreateBenchInputSchema,
  CreateSiteInputSchema,
  SettingsSchema,
  UpdateBenchInputSchema,

  UpdateSiteInputSchema,
  type Bench,
  MIN_PODMAN_MEMORY_MB,
  type Settings,
  type Site,
} from '../shared/domain/models';
import {
  canTransitionSiteStatus,
  isBenchReadyForSiteStatus,
} from '../shared/domain/site-lifecycle';
import { APP_CATALOG_SEED_VERSION, getDefaultAppCatalogSeed } from './services/catalog-provider';
import { createDefaultStorageSnapshot } from './storage/schema';
import type { LifecycleOperation } from './services/analytics';
import { orchestrateSiteAppsUpdate, orchestrateSiteCreation, orchestrateSiteDeletion } from './services/site-orchestration';
import { orchestrateBenchAppChanges, orchestrateBenchCreation, orchestrateBenchStart, orchestrateBenchStop, orchestrateBenchCleaning, orchestrateBenchDeletion, resetAllBenchContainers } from './services/bench-orchestration';

type IpcMainLike = {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
};


type TaskRunnerLike = {
  onEvent?: (listener: (event: TaskProgressEvent) => void) => () => void;
  enqueue: (definition: { name: string; resource: { type: 'bench' | 'site' | 'runtime' | 'system'; id: string }; run: (context: TaskExecutionContext) => Promise<void> }) => string;
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
    create: (input: SiteCreateInput & { status: 'queued' | 'running' | 'stopped' | 'success' | 'failure'; path: string }) => Promise<Site>;
    update: (id: string, input: Partial<SiteUpdateInput>) => Promise<Site | null>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly settings: {
    findAll?: () => Promise<Settings[]>;
    update?: (input: Partial<Settings>) => Promise<Settings>;
    get?: () => Promise<Settings | null>;
    set?: (input: Partial<Settings>) => Promise<Settings>;
  };
};

export type IpcOperations = {
  openPath: (targetPath: string) => Promise<boolean>;
  openInEditor: (targetPath: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  pathExists: (targetPath: string) => boolean;
  isFrontDoorAvailable?: () => boolean;
  refreshFrontDoorHosts?: () => Promise<void>;
  applyRuntimeMemory?: (memoryMb: number) => Promise<void>;
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
  appCount: bench.apps.length,
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
  appCount: site.apps.length,
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
  updateChannel: settings.updateChannel,
  autoUpdateEnabled: settings.autoUpdateEnabled,
  sidebarCompact: settings.sidebarCompact,
  podmanMemoryMb: settings.podmanMemoryMb,
});



const toLifecycleLogs = (
  entityId: string,
  entityName: string,
  status: 'queued' | 'running' | 'stopped' | 'success' | 'failure',
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
  ipcMainLike.handle(ipcChannels.appHealthCheck, async (): Promise<AppHealthResponse> => {
    return {
      appName: 'Local Bench',
      platform: process.platform,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      timestamp: new Date().toISOString(),
    };
  });

  ipcMainLike.handle(ipcChannels.runtimeFix, async (_event: unknown, checkType: unknown): Promise<boolean> => {
    if (typeof checkType !== 'string' || checkType !== 'runtime-health') return false;

    mainLogger.info('Attempting to fix runtime issues via unified service...');
    return await ensureRuntimeRunning();
  });

  ipcMainLike.handle(ipcChannels.taskRunnerSubscribe, async () => {
    return true;
  });

  ipcMainLike.handle(ipcChannels.taskRunnerUnsubscribe, async () => {
    return true;
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


  ipcMainLike.handle(ipcChannels.diagnosticsRun, async (): Promise<DiagnosticsReport> => {
    return runDiagnostics({
      runtimePaths,
      settingsRepository: {
        get: async () => getCurrentSettings(repositories.settings),
      },
      appVersion,
    });
  });

  ipcMainLike.handle(ipcChannels.diagnosticsGetLast, async (): Promise<DiagnosticsReport | null> => {
    return getLastDiagnosticsReport();
  });

  ipcMainLike.handle(ipcChannels.diagnosticsResetDevState, async (): Promise<boolean> => {
    const benches = await repositories.benches.findAll();

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
      await resetAllBenchContainers(benches, runtimeEnv, mainLogger);
    }

     // Remove all bench folders and their sites from the filesystem
     for (const bench of benches) {
       try {
         if (fs.existsSync(bench.path)) {
           await fs.promises.rm(bench.path, { recursive: true, force: true });
           mainLogger.info(`Removed bench folder: ${bench.path}`);
         }
       } catch (error) {
         mainLogger.warn(`Failed to remove bench folder ${bench.path}: ${error}`);
       }
     }

     const settings = await getCurrentSettings(repositories.settings);
     if (settings?.storagePath) {
       const benchesDir = path.join(resolveUserPath(settings.storagePath), 'benches');
       try {
         if (fs.existsSync(benchesDir)) {
           await fs.promises.rm(benchesDir, { recursive: true, force: true });
           mainLogger.info(`Removed dormant benches folder: ${benchesDir}`);
         }
       } catch (error) {
         mainLogger.warn(`Failed to remove benches folder ${benchesDir}: ${error}`);
       }
     }

     if (isPodmanMachineRequired()) {
       try {
         mainLogger.info(`Destroying dedicated podman machine: ${LOCAL_BENCH_MACHINE_NAME}`);
         await execPromise(getBinaryPath('podman'), ['machine', 'rm', '--force', LOCAL_BENCH_MACHINE_NAME]);
         mainLogger.info(`Successfully destroyed podman machine: ${LOCAL_BENCH_MACHINE_NAME}`);
       } catch (error) {
         mainLogger.warn(`Failed to destroy podman machine ${LOCAL_BENCH_MACHINE_NAME}: ${error}`);
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
    const payload = CreateBenchInputSchema.parse({
      ...rawInput,
      path: resolveUserPath(rawInput.path),
    });
    const normalizedApps = withCoreBenchApps(payload.apps);

    const existingBenches = await repositories.benches.findAll();
    const usedPorts = deriveUsedBenchPorts(existingBenches);
    const requestedPort = payload.httpPort;
    const startPort = requestedPort ?? DEFAULT_HTTP_PORT;
    const httpPort = await findNextAvailableTcpPort(startPort, usedPorts);

    const created = await repositories.benches.create({
      ...payload,
      status: 'queued', // Initial state should be queued
      apps: normalizedApps,
      httpPort,
    });

    operations.trackBenchOperation?.(created.id, 'create');
    orchestrateBenchCreation(created, repositories.benches, repositories.appCatalog);

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

    const requestedApps = Array.isArray(payload.apps) ? payload.apps : undefined;
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
      if (targetStatus === 'running' || targetStatus === 'stopped') {
        // Do not allow conflicting lifecycle requests while transition is already queued.
        if (existing.status === 'queued') {
          mainLogger.info(`Ignoring bench status change while queued. benchId=${id} target=${targetStatus}`);
          return toBenchListItem(updated);
        }

        // Set to queued in DB immediately so UI shows pending state.
        updated = (await repositories.benches.update(id, { status: 'queued' })) ?? updated;

        if (targetStatus === 'running') {
          const isRestart = existing.status === 'running';
          orchestrateBenchStart(updated, repositories.benches, isRestart);
        } else {
          orchestrateBenchStop(updated, repositories.benches);
        }
      } else {
        // Normal status update without orchestration.
        updated = (await repositories.benches.update(id, { status: targetStatus })) ?? updated;
      }
    }

    if (appsChanged && existing.status === 'running' && !targetStatus) {
      orchestrateBenchAppChanges(updated, repositories.benches, repositories.appCatalog, existing.apps, requestedApps ?? []);
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
      const { getComposeProjectName } = await import('./utils/podman/compose-args');
      const { openBenchShell } = await import('./utils/terminal');
      const projectName = getComposeProjectName(bench.id);
      const runtimeEnv = await getRuntimeEnv();
      await openBenchShell(bench.path, projectName, runtimeEnv);
      operations.trackBenchOperation?.(bench.id, 'open-folder'); // Optional: reuse this or add new 'open-shell'
      return true;
    } catch (error) {
      mainLogger.error(`Failed to open shell for bench ${bench.name}:`, error);
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

  ipcMainLike.handle(ipcChannels.sitesList, async () => {
    const sites = await repositories.sites.findAll();
    return [...sites].sort(byCreatedAtDesc).map(toSiteListItem);
  });

  ipcMainLike.handle(ipcChannels.sitesCreate, async (_event: unknown, input: unknown) => {
    const payload = CreateSiteInputSchema.parse(input as SiteCreateInput);
    const existingSites = await repositories.sites.findAll();
    if (hasDuplicateSiteHost(existingSites, payload.name)) {
      throw new Error(`A site host "${normalizeSiteHost(payload.name)}" already exists. Use a unique site name.`);
    }

    const bench = await repositories.benches.findById(payload.benchId);
    if (!bench) {
      throw new Error('Cannot create site: parent bench was not found.');
    }
    if (bench.status !== 'running') {
      throw new Error(`Cannot create site. Bench "${bench.name}" is not running. Please start the bench first.`);
    }

    const unavailableApps = payload.apps.filter((app) => !bench.apps.includes(app));
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
      if (existing.status !== 'running' && existing.status !== 'stopped') {
        throw new Error('Site must be ready before activating apps.');
      }

      const unavailableApps = requestedApps.filter((app) => !bench.apps.includes(app));
      if (unavailableApps.length > 0) {
        throw new Error(`Cannot activate apps not installed on bench: ${unavailableApps.join(', ')}`);
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
      return operations.openExternal(`https://${preferredHost}`);
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
      operations.applyRuntimeMemory &&
      payload.podmanMemoryMb !== undefined &&
      payload.podmanMemoryMb !== current?.podmanMemoryMb
    ) {
      await operations.applyRuntimeMemory(payload.podmanMemoryMb);
    }
    const updated = await updateSettings(repositories.settings, payload);
    return toSettingsItem(updated);
  });

  ipcMainLike.handle(ipcChannels.systemResourcesGet, (): SystemResources => {
    const totalMemoryMb = Math.max(
      MIN_PODMAN_MEMORY_MB,
      Math.floor(os.totalmem() / (1024 * 1024))
    );
    const recommendedPodmanMemoryMb = Math.max(
      MIN_PODMAN_MEMORY_MB,
      Math.floor((totalMemoryMb * 0.75) / 1024) * 1024
    );
    return {
      totalMemoryMb,
      recommendedPodmanMemoryMb: Math.min(recommendedPodmanMemoryMb, totalMemoryMb),
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


  ipcMainLike.handle(ipcChannels.updateCheckNow, async (): Promise<UpdateCheckResult> => {
    return runManualUpdateCheck();
  });

  ipcMainLike.handle(ipcChannels.updateGetStatus, async (): Promise<UpdateStrategyStatus> => {
    const settings = await getCurrentSettings(repositories.settings);
    return buildUpdateStrategyStatus(settings, appVersion);
  });
};
