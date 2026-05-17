import type {
  AppHealthResponse,
  BenchCreateInput,
  BenchListItem,
  BenchUpdateInput,
  CatalogAppItem,
  LifecycleLogItem,
  SettingsItem,
  SiteCreateInput,
  SiteListItem,
  SiteUpdateInput,
  UpdateCheckResult,
  UpdateStrategyStatus,
} from '../shared/ipc';
import type { DiagnosticsReport } from '../shared/domain/diagnostics';
import { runDiagnostics, getLastDiagnosticsReport } from './diagnostics-service';
import { ensureRuntimeRunning, getRuntimeEnv } from './runtime-service';
import { buildUpdateStrategyStatus, runManualUpdateCheck } from './update-strategy-service';
import { ipcChannels } from '../shared/ipc';
import type { TaskProgressEvent } from '../shared/domain/task-runner';
import { getTaskRunner, type TaskExecutionContext } from './task-runner';
import { createMainLogger } from './logger';
import { findNextAvailableTcpPort } from './utils/ports';
import { normalizeSiteHost } from '../shared/site-hostname';
import { withCoreBenchApps } from '../shared/bench-apps';
import { resolveBenchHttpPort } from './utils/bench-http-port';
import { removeAllLocalBenchHostsEntries } from './hosts-manager';

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
  type Settings,
  type Site,
} from '../shared/domain/models';
import {
  canTransitionSiteStatus,
  isBenchReadyForSiteStatus,
} from '../shared/domain/site-lifecycle';
import { APP_CATALOG_SEED_VERSION, getDefaultAppCatalogSeed } from './catalog-provider';
import { createDefaultStorageSnapshot } from './storage/schema';
import { execPromise } from './utils/exec';
import { getBinaryPath } from './utils/binaries';
import { OPERATION_TIMEOUTS } from './constants';
import type { BenchLifecycleOperation } from './bench-analytics';
import type { SiteLifecycleOperation } from './site-analytics';
import { orchestrateSiteAppsUpdate, orchestrateSiteCreation, orchestrateSiteDeletion, orchestrateSiteStatusUpdate } from './site-orchestration';
import { orchestrateBenchAppChanges, orchestrateBenchCreation, orchestrateBenchStart, orchestrateBenchStop, orchestrateBenchCleaning, orchestrateBenchDeletion } from './bench-orchestration';

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

const DEFAULT_HTTP_PORT = 8080;

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
  trackBenchOperation?: (benchId: string, operation: BenchLifecycleOperation) => void;
  trackSiteOperation?: (siteId: string, operation: SiteLifecycleOperation) => void;
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

    // Reset performs one hosts cleanup pass so macOS prompts for permission only once.
    try {
      await removeAllLocalBenchHostsEntries();
    } catch (err) {
      mainLogger.warn(`Failed to remove Local Bench hosts block during reset: ${err}`);
    }

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
      const composeBinary = getBinaryPath('docker-compose');

      for (const bench of benches) {
        const projectName = `local-bench-${bench.id.slice(0, 8)}`;
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
          mainLogger.warn(`Failed to clean compose project ${projectName}: ${error}`);
        }
      }

      const podmanBinary = getBinaryPath('podman');
      const listNames = async (args: string[]): Promise<string[]> => {
        try {
          const { stdout } = await execPromise(podmanBinary, args, undefined, undefined, runtimeEnv, 60000);
          return stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        } catch (error) {
          mainLogger.warn(`Failed to list podman resources for args [${args.join(' ')}]: ${error}`);
          return [];
        }
      };

      const containerIds = await listNames(['ps', '-a', '--filter', 'name=local-bench-', '--format', '{{.ID}}']);
      if (containerIds.length > 0) {
        try {
          await execPromise(podmanBinary, ['rm', '-f', ...containerIds], undefined, undefined, runtimeEnv, 60000);
        } catch (error) {
          mainLogger.warn(`Failed to remove local-bench containers: ${error}`);
        }
      }

      const volumeNames = await listNames(['volume', 'ls', '--filter', 'name=local-bench-', '--format', '{{.Name}}']);
      if (volumeNames.length > 0) {
        try {
          await execPromise(podmanBinary, ['volume', 'rm', '-f', ...volumeNames], undefined, undefined, runtimeEnv, 60000);
        } catch (error) {
          mainLogger.warn(`Failed to remove local-bench volumes: ${error}`);
        }
      }

      const networkNames = await listNames(['network', 'ls', '--filter', 'name=local-bench-', '--format', '{{.Name}}']);
      if (networkNames.length > 0) {
        try {
          await execPromise(podmanBinary, ['network', 'rm', ...networkNames], undefined, undefined, runtimeEnv, 60000);
        } catch (error) {
          mainLogger.warn(`Failed to remove local-bench networks: ${error}`);
        }
      }
    }

     // Remove all bench folders and their sites from the filesystem
     for (const bench of benches) {
       try {
         if (fs.existsSync(bench.path)) {
           fs.rmSync(bench.path, { recursive: true, force: true });
           mainLogger.info(`Removed bench folder: ${bench.path}`);
         }
       } catch (error) {
         mainLogger.warn(`Failed to remove bench folder ${bench.path}: ${error}`);
       }
     }

    fs.rmSync(runtimePaths.storagePath, { recursive: true, force: true });
    fs.rmSync(runtimePaths.configPath, { recursive: true, force: true });
    fs.mkdirSync(runtimePaths.storagePath, { recursive: true });

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

  ipcMainLike.handle(ipcChannels.benchesCleanSites, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench) {
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

    const unavailableApps = payload.apps.filter((app) => !bench.apps.includes(app));
    if (unavailableApps.length > 0) {
      throw new Error(`Cannot create site with apps not installed on bench: ${unavailableApps.join(', ')}`);
    }

    const created = await orchestrateSiteCreation(repositories, payload);
    operations.trackSiteOperation?.(created.id, 'create');
    await operations.refreshFrontDoorHosts?.();
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
      return null;
    }

    if (
      existing.status === 'queued' &&
      targetStatus &&
      (targetStatus === 'running' || targetStatus === 'stopped')
    ) {
      return toSiteListItem(existing);
    }

    const requestedApps = Array.isArray(payload.apps)
      ? Array.from(new Set(payload.apps.map((app) => app.trim()).filter(Boolean)))
      : null;

    if (requestedApps) {
      if (existing.status !== 'running') {
        throw new Error('Site must be running before activating apps.');
      }

      const unavailableApps = requestedApps.filter((app) => !bench.apps.includes(app));
      if (unavailableApps.length > 0) {
        throw new Error(`Cannot activate apps not installed on bench: ${unavailableApps.join(', ')}`);
      }

      const appsToInstall = requestedApps.filter((app) => !existing.apps.includes(app));
      const removedApps = existing.apps.filter((app) => !requestedApps.includes(app));

      if (removedApps.length > 0) {
        throw new Error('Removing apps from a site is not supported yet.');
      }

      if (appsToInstall.length === 0) {
        return toSiteListItem(existing);
      }

      const queuedSite = (await repositories.sites.update(id, { status: 'queued' })) ?? existing;
      operations.trackSiteOperation?.(queuedSite.id, 'update');

      orchestrateSiteAppsUpdate(repositories, existing, requestedApps);
      return toSiteListItem(queuedSite);
    }

    const { apps: _ignoredApps, ...safeOtherUpdates } = otherUpdates;
    let updated = await repositories.sites.update(id, safeOtherUpdates);

    if (updated) {
      operations.trackSiteOperation?.(updated.id, 'update');
      await operations.refreshFrontDoorHosts?.();

      if (targetStatus && (targetStatus !== existing?.status || targetStatus === 'running')) {
        if (targetStatus === 'running' || targetStatus === 'stopped') {
          // Set to queued in DB immediately so UI shows pending state
          updated = (await repositories.sites.update(id, { status: 'queued' })) ?? updated;
          orchestrateSiteStatusUpdate(repositories, updated!, targetStatus);
        } else {
          updated = (await repositories.sites.update(id, { status: targetStatus })) ?? updated;
        }
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
    if (site.status === 'running') {
      throw new Error('Cannot delete a running site. Please stop it first.');
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
    const updated = await updateSettings(repositories.settings, payload);
    return toSettingsItem(updated);
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
