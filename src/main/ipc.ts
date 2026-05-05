import type {
  AppHealthResponse,
  BenchCreateInput,
  BenchListItem,
  BenchUpdateInput,
  ImportExecuteInput,
  ImportExecutionResponse,
  ImportValidationResponse,

  ExportSitePackageInput,
  ExportSitePackageResponse,
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
import { ensureRuntimeRunning } from './runtime-service';
import { buildUpdateStrategyStatus, runManualUpdateCheck } from './update-strategy-service';
import { ipcChannels } from '../shared/ipc';
import type { TaskProgressEvent } from '../shared/domain/task-runner';
import { getTaskRunner } from './task-runner';
import { execPromise } from './utils/exec';
import { getBinaryPath } from './utils/binaries';
import { createMainLogger } from './logger';

const mainLogger = createMainLogger('ipc');

import type { AppRuntimePaths } from './config';
import { CURRENT_STORAGE_SCHEMA_VERSION } from './storage/schema';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BrowserWindow, dialog, shell } from 'electron';
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
  canAttachSiteToBench,
  canTransitionSiteStatus,
  isBenchReadyForSiteStatus,
} from '../shared/domain/site-lifecycle';
import type { BenchLifecycleOperation } from './bench-analytics';
import type { SiteLifecycleOperation } from './site-analytics';
import { orchestrateSiteCreation, orchestrateSiteDeletion } from './site-orchestration';
import { orchestrateBenchCreation, orchestrateBenchStart, orchestrateBenchStop, orchestrateBenchCleaning, orchestrateBenchDeletion } from './bench-orchestration';
import { parseImportPackage, validateImportCompatibility } from './import-package-validator';
import { executeImportPackage } from './import-execution';
import { exportSitePackage } from './export-package-writer';

type IpcMainLike = {
  handle: (channel: string, listener: (...args: any[]) => any) => void;
};


type TaskRunnerLike = {
  onEvent: (listener: (event: TaskProgressEvent) => void) => () => void;
  enqueue: (definition: any) => string;
};

const resolveBundledPodmanMachineImagePath = (): string | null => {
  const executableName = process.platform === 'win32' ? 'podman.exe' : 'podman';
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);

  for (const entry of pathEntries) {
    const podmanPath = path.join(entry, executableName);
    if (!fs.existsSync(podmanPath)) {
      continue;
    }

    const imageCandidates = [
      path.join(entry, 'podman-machine-image.raw'),
      path.join(entry, 'podman-machine-image.qcow2'),
      path.join(entry, 'podman-machine-image'),
    ];

    const found = imageCandidates.find((candidate) => fs.existsSync(candidate));
    if (found) {
      return found;
    }
  }

  return null;
};

const resolveUserPath = (untrimmedPath: string): string => {
  const trimmedPath = untrimmedPath.trim();
  if (trimmedPath.startsWith('~')) {
    return path.join(os.homedir(), trimmedPath.slice(1));
  }

  return path.resolve(trimmedPath);
};

export type IpcRepositories = {
  readonly appCatalog: {
    findAll: () => Promise<CatalogAppItem[]>;
    sync: (apps: CatalogAppItem[]) => Promise<void>;
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
    findAll: () => Promise<Settings[]>;
    update: (input: Partial<Settings>) => Promise<Settings>;
  };
};

export type IpcOperations = {
  openPath: (targetPath: string) => Promise<boolean>;
  openInEditor: (targetPath: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  pathExists: (targetPath: string) => boolean;
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
  createdAt: site.timestamps.createdAt,
  updatedAt: site.timestamps.updatedAt,
});

const toSettingsItem = (settings: Settings): SettingsItem => ({
  defaultFrappeVersion: settings.defaultFrappeVersion,
  storagePath: settings.storagePath,
  terminalPreference: settings.terminalPreference,
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

export const registerIpcHandlers = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations = {
    openPath: async () => false,
    openInEditor: async () => false,
    openExternal: async () => false,
    pathExists: (targetPath) => fs.existsSync(targetPath),
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
    binariesPath: '',
  }
) => {
  ipcMainLike.handle(ipcChannels.appHealthCheck, async (): Promise<AppHealthResponse> => {
    return {
      appName: 'Frappe Cafe',
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
  taskRunner.onEvent((event) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(ipcChannels.taskRunnerProgressEvent, event);
      }
    });
  });


  ipcMainLike.handle(ipcChannels.diagnosticsRun, async (): Promise<DiagnosticsReport> => {
    return runDiagnostics({
      runtimePaths,
      settingsRepository: {
        get: async () => {
          const settings = await repositories.settings.findAll();
          return settings[0] || null;
        },
      },
      appVersion,
    });
  });

  ipcMainLike.handle(ipcChannels.diagnosticsGetLast, async (): Promise<DiagnosticsReport | null> => {
    return getLastDiagnosticsReport();
  });

  ipcMainLike.handle(ipcChannels.benchesList, async () => {
    const benches = await repositories.benches.findAll();
    return benches.map(toBenchListItem);
  });

  ipcMainLike.handle(ipcChannels.benchesCreate, async (_event: unknown, input: unknown) => {
    const rawInput = input as BenchCreateInput;
    const payload = CreateBenchInputSchema.parse({
      ...rawInput,
      path: resolveUserPath(rawInput.path),
    });

    const created = await repositories.benches.create({
      ...payload,
      status: 'queued', // Initial state should be queued
      apps: [],
    });

    operations.trackBenchOperation?.(created.id, 'create');
    orchestrateBenchCreation(created, repositories.benches, runtimePaths);

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

    const { status: targetStatus, ...otherUpdates } = payload;
    let updated = await repositories.benches.update(id, otherUpdates);

    if (updated) {
      operations.trackBenchOperation?.(updated.id, 'update');

      if (targetStatus && (targetStatus !== existing?.status || targetStatus === 'running')) {
        if (targetStatus === 'running' || targetStatus === 'stopped') {
          // Set to queued in DB immediately so UI shows pending state
          updated = (await repositories.benches.update(id, { status: 'queued' })) ?? updated;
          
          if (targetStatus === 'running') {
            const isRestart = existing?.status === 'running';
            orchestrateBenchStart(updated, repositories.benches, isRestart);
          } else {
            orchestrateBenchStop(updated, repositories.benches);
          }
        } else {
          // Normal status update without orchestration
          updated = (await repositories.benches.update(id, { status: targetStatus })) ?? updated;
        }
      }
    }
    return updated ? toBenchListItem(updated) : null;
  });

  ipcMainLike.handle(ipcChannels.benchesDelete, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const bench = await repositories.benches.findById(id);
    if (!bench) {
      return false;
    }

    taskRunner.enqueue({
      name: `Delete Bench: ${bench.name}`,
      resource: { type: 'bench', id: bench.id },
      run: async (context: any) => {
        try {
          await orchestrateBenchDeletion(bench, repositories.benches, repositories.sites, context);
        } catch (error) {
          mainLogger.error('Failed to delete bench:', error);
          throw error;
        }
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
      run: async (context: any) => {
        try {
          await orchestrateBenchCleaning(bench, repositories.benches, context);
        } catch (error) {
          mainLogger.error('Failed to clean bench:', error);
          throw error;
        }
      },
    });

    operations.trackBenchOperation?.(id, 'clean');
    return true;
  });

  ipcMainLike.handle(ipcChannels.catalogList, async () => {
    return repositories.appCatalog.findAll();
  });

  ipcMainLike.handle(ipcChannels.catalogSync, async (_event: unknown, apps: unknown) => {
    if (!Array.isArray(apps)) {
      return false;
    }

    await repositories.appCatalog.sync(apps as CatalogAppItem[]);
    return true;
  });

  ipcMainLike.handle(ipcChannels.sitesList, async () => {
    const sites = await repositories.sites.findAll();
    return sites.map(toSiteListItem);
  });

  ipcMainLike.handle(ipcChannels.sitesCreate, async (_event: unknown, input: unknown) => {
    const payload = CreateSiteInputSchema.parse({
      ...(input as SiteCreateInput),
      status: 'stopped',
    });

    const created = await orchestrateSiteCreation(repositories, payload);
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

    if (!isBenchReadyForSiteStatus(bench.status, targetSiteStatus)) {
      return null;
    }

    const { status: targetStatus, ...otherUpdates } = payload;
    let updated = await repositories.sites.update(id, otherUpdates);

    if (updated) {
      operations.trackSiteOperation?.(updated.id, 'update');

      if (targetStatus && targetStatus !== existing?.status) {
        if (targetStatus === 'running' || targetStatus === 'stopped') {
          // Set to queued in DB immediately so UI shows pending state
          updated = (await repositories.sites.update(id, { status: 'queued' })) ?? updated;
          
          const benches = await repositories.benches.findAll();
          orchestrateSiteCreation(updated, { benches: repositories.benches, sites: repositories.sites }, benches);
        } else {
          // Normal status update without orchestration
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

    const result = await orchestrateSiteDeletion(repositories, id);
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

    const url = `http://${site.name}.local`;
    const opened = await operations.openExternal(url);
    if (opened) {
      // open-external is not a valid SiteLifecycleOperation, ignoring track
    }
    return opened;
  });

  ipcMainLike.handle(ipcChannels.settingsGet, async () => {
    const settings = await repositories.settings.findAll();
    return settings.length > 0 ? toSettingsItem(settings[0]) : null;
  });

  ipcMainLike.handle(ipcChannels.settingsSet, async (_event: unknown, input: unknown) => {
    const payload = SettingsSchema.partial().parse(input);
    const updated = await repositories.settings.update(payload);
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

  ipcMainLike.handle(ipcChannels.exportSitePackage, async (_event: unknown, input: unknown): Promise<ExportSitePackageResponse> => {
    return exportSitePackage(repositories as any, input as any);
  });

  ipcMainLike.handle(ipcChannels.importValidatePackage, async (_event: unknown, input: unknown): Promise<ImportValidationResponse> => {
    const result: any = await parseImportPackage(input as any);
    const compatibility = await validateImportCompatibility(repositories as any, result);
    return {
       success: compatibility.success || false,
       issues: compatibility.issues,
       summary: {
          packageVersion: result.manifest.version,
          exportedAt: result.manifest.metadata.exportedAt,
          siteName: result.manifest.site.name,
          benchName: result.manifest.bench.name,
          benchFrappeVersion: result.manifest.bench.frappeVersion,
          requiredAppIds: result.manifest.apps.map((a: any) => a.name)
       }
    };
  });

  ipcMainLike.handle(ipcChannels.importExecutePackage, async (_event: unknown, input: unknown): Promise<ImportExecutionResponse> => {
    return executeImportPackage(repositories as any, input as any);
  });

  ipcMainLike.handle(ipcChannels.updateCheckNow, async (): Promise<UpdateCheckResult> => {
    return runManualUpdateCheck();
  });

  ipcMainLike.handle(ipcChannels.updateGetStatus, async (): Promise<UpdateStrategyStatus> => {
    return buildUpdateStrategyStatus();
  });
};