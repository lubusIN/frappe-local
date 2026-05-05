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
  SiteUpdateInput,
  TerminalErrorEvent,
  TerminalSessionInspection,
  TerminalOutputEvent,
  TerminalStateChangeEvent,
  UpdateCheckResult,
  UpdateStrategyStatus,
} from '../shared/ipc';
import type { DiagnosticsReport } from '../shared/domain/diagnostics';
import { runDiagnostics } from './diagnostics-service';
import { buildUpdateStrategyStatus, runManualUpdateCheck } from './update-strategy-service';
import { ipcChannels } from '../shared/ipc';
import type { TerminalCreateResponse } from '../shared/ipc';
import type { TaskProgressEvent } from '../shared/domain/task-runner';
import { getTerminalService } from './terminal-service';
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
import { BrowserWindow, dialog } from 'electron';
import {
  CreateBenchInputSchema,
  CreateGroupInputSchema,
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
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
};

type TerminalServiceLike = {
  onOutput: (listener: (event: TerminalOutputEvent) => void) => () => void;
  onError: (listener: (event: TerminalErrorEvent) => void) => () => void;
  onStateChange: (listener: (event: TerminalStateChangeEvent) => void) => () => void;
  createSession: ReturnType<typeof getTerminalService>['createSession'];
  getSession: ReturnType<typeof getTerminalService>['getSession'];
  write: ReturnType<typeof getTerminalService>['write'];
  closeSession: ReturnType<typeof getTerminalService>['closeSession'];
  clear: ReturnType<typeof getTerminalService>['clear'];
  resize: ReturnType<typeof getTerminalService>['resize'];
};

type TaskRunnerLike = {
  onEvent: (listener: (event: TaskProgressEvent) => void) => () => void;
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



export type AppRepositories = {
  readonly appCatalog: {
    findAll: () => Promise<Array<{
      id: string;
      name: string;
      description: string;
      source: string;
      version: string;
      category?: string;
      icon?: string;
      compatibility: {
        minimumFrappeVersion?: string;
        maximumFrappeVersion?: string;
      };
    }>>;
    findById: (id: string) => Promise<{
      id: string;
      name: string;
      description: string;
      source: string;
      version: string;
      category?: string;
      icon?: string;
      compatibility: {
        minimumFrappeVersion?: string;
        maximumFrappeVersion?: string;
      };
    } | null>;
    search: (query: string) => Promise<Array<{
      id: string;
      name: string;
      description: string;
      source: string;
      version: string;
      category?: string;
      icon?: string;
      compatibility: {
        minimumFrappeVersion?: string;
        maximumFrappeVersion?: string;
      };
    }>>;
  };
  readonly benches: {
    findAll: () => Promise<Bench[]>;
    findById: (id: string) => Promise<Bench | null>;
    create: (input: {
      name: string;
      path: string;
      frappeVersion: string;

      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      apps: string[];
    }) => Promise<Bench>;
    update: (id: string, input: {
      name?: string;
      path?: string;
      frappeVersion?: string;

      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      apps?: string[];
    }) => Promise<Bench | null>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly sites: {
    findAll: () => Promise<Site[]>;
    findById: (id: string) => Promise<Site | null>;
    create: (input: {
      name: string;
      benchId: string;
      groupId: string | null;
      apps: string[];
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path: string;
    }) => Promise<Site>;
    update: (id: string, input: {
      name?: string;
      benchId?: string;
      groupId?: string | null;
      apps?: string[];
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path?: string;
    }) => Promise<Site | null>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly settings: {
    get: () => Promise<Settings | null>;
    set: (input: Settings) => Promise<Settings>;
  };

};

export type IpcOperations = {
  readonly openPath: (targetPath: string) => Promise<boolean>;
  readonly openInEditor: (targetPath: string, editorPreference: string) => Promise<boolean>;
  readonly pathExists: (targetPath: string) => boolean;
  readonly openExternal: (url: string) => Promise<void>;
  readonly trackBenchOperation?: (benchId: string, operation: BenchLifecycleOperation) => void;
  readonly trackSiteOperation?: (siteId: string, operation: SiteLifecycleOperation) => void;
};

export const buildAppHealthResponse = (): AppHealthResponse => ({
  appName: 'Frappe Cafe',
  platform: process.platform,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  timestamp: new Date().toISOString(),
});

const toCatalogAppItem = (item: {
  id: string;
  name: string;
  description: string;
  source: string;
  version: string;
  category?: string;
  icon?: string;
  compatibility: {
    minimumFrappeVersion?: string;
    maximumFrappeVersion?: string;
  };
}): CatalogAppItem => ({
  id: item.id,
  name: item.name,
  description: item.description,
  source: item.source,
  version: item.version,
  category: item.category ?? 'other',
  icon: item.icon,
  compatibility: {
    minimumFrappeVersion: item.compatibility.minimumFrappeVersion,
    maximumFrappeVersion: item.compatibility.maximumFrappeVersion,
  },
});

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
  groupId: site.groupId,
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
      message: `Entity created at ${path}`,
      timestamp: createdAt,
    },
    {
      id: `${entityId}-status`,
      entityId,
      level: status === 'failure' ? 'error' : 'info',
      message: `Current status: ${status}`,
      timestamp: updatedAt,
    },
  ];

  return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

const findDevcontainerTarget = (benchPath: string, pathExists: (targetPath: string) => boolean): string | null => {
  const devcontainerFolder = path.join(benchPath, '.devcontainer');
  const devcontainerFile = path.join(benchPath, 'devcontainer.json');

  if (pathExists(devcontainerFolder)) {
    return devcontainerFolder;
  }

  if (pathExists(devcontainerFile)) {
    return devcontainerFile;
  }

  return null;
};

const resolveUserPath = (rawPath: string): string => {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    return trimmedPath;
  }

  if (trimmedPath === '~') {
    return os.homedir();
  }

  if (trimmedPath.startsWith('~/') || trimmedPath.startsWith('~\\')) {
    return path.join(os.homedir(), trimmedPath.slice(2));
  }

  return path.resolve(trimmedPath);
};

export const registerIpcHandlers = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations = {
    openPath: async () => false,
    openInEditor: async () => false,
    pathExists: (targetPath) => fs.existsSync(targetPath),
    trackBenchOperation: () => undefined,
    trackSiteOperation: () => undefined,
  },
  terminalService: TerminalServiceLike = getTerminalService(),
  taskRunner: TaskRunnerLike = getTaskRunner(),

  appVersion: string = '0.1.0',
  runtimePaths: AppRuntimePaths = {
    userDataPath: '',
    logsPath: '',
    configPath: '',
    storagePath: '',
  },
  initialDiagnosticsReport: { current: DiagnosticsReport | null } = { current: null }
): void => {
  let taskEventSubscriptionCount = 0;

  const broadcast = <T>(channel: string, payload: T): void => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channel, payload);
    });
  };

  terminalService.onOutput((event: TerminalOutputEvent) => {
    broadcast(ipcChannels.terminalOutputEvent, event);
  });

  terminalService.onError((event: TerminalErrorEvent) => {
    broadcast(ipcChannels.terminalErrorEvent, event);
  });

  terminalService.onStateChange((event: TerminalStateChangeEvent) => {
    broadcast(ipcChannels.terminalStateChangeEvent, event);
  });

  taskRunner.onEvent((event: TaskProgressEvent) => {
    if (taskEventSubscriptionCount > 0) {
      broadcast(ipcChannels.taskRunnerProgressEvent, event);
    }
  });

  ipcMainLike.handle(ipcChannels.appHealthCheck, async () => buildAppHealthResponse());

  ipcMainLike.handle(ipcChannels.updateGetStatus, async (): Promise<UpdateStrategyStatus> => {
    const settings = await repositories.settings.get();
    return buildUpdateStrategyStatus(settings, appVersion);
  });

  ipcMainLike.handle(ipcChannels.updateCheckNow, async (): Promise<UpdateCheckResult> => {
    return runManualUpdateCheck();
  });

  let lastDiagnosticsReport: DiagnosticsReport | null = initialDiagnosticsReport.current;

  ipcMainLike.handle(ipcChannels.diagnosticsRun, async (): Promise<DiagnosticsReport> => {
    const report = await runDiagnostics({
      runtimePaths,

      settingsRepository: repositories.settings,
      appVersion,
    });
    lastDiagnosticsReport = report;
    return report;
  });

  ipcMainLike.handle(ipcChannels.diagnosticsGetLast, async (): Promise<DiagnosticsReport | null> => {
    return lastDiagnosticsReport || initialDiagnosticsReport.current;
  });

  ipcMainLike.handle(ipcChannels.runtimeFix, async (_event: unknown, checkType: unknown): Promise<boolean> => {
    if (typeof checkType !== 'string' || checkType !== 'runtime-health') return false;

    mainLogger.info('Attempting to fix runtime issues...');

    try {
      // 1. Check if podman binary is actually there
      try {
        await execPromise(getBinaryPath('podman'), ['--version']);
      } catch {
        mainLogger.error('Podman binary not found, cannot fix.');
        return false;
      }

      // 2. Machine handling (Mac/Windows)
      if (process.platform === 'darwin' || process.platform === 'win32') {
        const { stdout } = await execPromise(getBinaryPath('podman'), ['machine', 'ls', '--format', 'json']);
        const machines = JSON.parse(stdout || '[]');

        // On Mac, ensure helper is installed first if needed
        if (process.platform === 'darwin') {
          try {
            await execPromise('/usr/local/bin/podman-mac-helper', ['--version']);
          } catch {
            mainLogger.info('Podman Mac Helper not found, attempting elevated installation...');
            const helperPath = getBinaryPath('podman-mac-helper');
            // Use osascript to prompt for administrator password
            const appleScript = `do shell script "${helperPath} install" with administrator privileges`;
            await execPromise('osascript', ['-e', appleScript]);
            mainLogger.info('Podman Mac Helper installed successfully.');
          }
        }

        if (machines.length === 0) {
          mainLogger.info('No podman machine found, initializing...');
          const initArgs = ['machine', 'init'];
          const bundledImagePath = resolveBundledPodmanMachineImagePath();
          if (bundledImagePath) {
            initArgs.push('--image', bundledImagePath);
            mainLogger.info(`Using bundled Podman machine image at ${bundledImagePath}`);
          }
          await execPromise(getBinaryPath('podman'), initArgs);
        }
 
        const isRunning = machines.some((m: any) => m.Running === true);
        if (!isRunning) {
          mainLogger.info('Starting podman machine...');
          const { code } = await execPromise(getBinaryPath('podman'), ['machine', 'start']);
          return code === 0;
        } else {
          try {
            await execPromise(getBinaryPath('podman'), ['ps'], undefined, undefined, undefined, 5000);
            return true;
          } catch {
            mainLogger.warn('Podman machine is unresponsive, attempting force restart...');
            if (process.platform === 'darwin') {
              try { await execPromise('pkill', ['-9', 'vfkit']); } catch {}
            }
            try { await execPromise(getBinaryPath('podman'), ['machine', 'stop']); } catch {}
            mainLogger.info('Restarting podman machine...');
            const { code } = await execPromise(getBinaryPath('podman'), ['machine', 'start']);
            return code === 0;
          }
        }
      }

      // On Linux, maybe just check if service is running? 
      // For now, we mainly fix VM issues.
      return true;
    } catch (error) {
      mainLogger.error('Failed to fix runtime issue:', error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.taskRunnerSubscribe, async () => {
    taskEventSubscriptionCount += 1;
    return taskEventSubscriptionCount > 0;
  });

  ipcMainLike.handle(ipcChannels.taskRunnerUnsubscribe, async () => {
    taskEventSubscriptionCount = Math.max(0, taskEventSubscriptionCount - 1);
    return taskEventSubscriptionCount > 0;
  });

  ipcMainLike.handle(ipcChannels.catalogList, async () => {
    const items = await repositories.appCatalog.findAll();
    return items.map(toCatalogAppItem);
  });

  ipcMainLike.handle(ipcChannels.catalogFindById, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') return null;
    const item = await repositories.appCatalog.findById(id);
    return item ? toCatalogAppItem(item) : null;
  });

  ipcMainLike.handle(ipcChannels.catalogSearch, async (_event: unknown, query: unknown) => {
    const q = typeof query === 'string' ? query : '';
    const items = await repositories.appCatalog.search(q);
    return items.map(toCatalogAppItem);
  });

  ipcMainLike.handle(ipcChannels.benchesList, async () => {
    const benches = await repositories.benches.findAll();
    return benches.map(toBenchListItem);
  });

  ipcMainLike.handle(ipcChannels.benchesPickFolder, async () => {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(targetWindow, {
      title: 'Select Bench Folder',
      buttonLabel: 'Select Folder',
      defaultPath: os.homedir(),
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return resolveUserPath(result.filePaths[0]);
  });

  ipcMainLike.handle(ipcChannels.benchesCreate, async (_event: unknown, input: unknown) => {
    const rawInput = input as BenchCreateInput;
    const benches = await repositories.benches.findAll();
    const normalizedPath = resolveUserPath(rawInput.path);
    
    // Check for duplicate name or path
    if (benches.some((b) => b.name === rawInput.name)) {
      throw new Error(`A bench with the name "${rawInput.name}" already exists.`);
    }
    if (benches.some((b) => b.path === normalizedPath)) {
      throw new Error(`A bench is already registered at this path.`);
    }

    const existingPorts = benches.map(b => b.httpPort).filter((p): p is number => p !== undefined);
    const nextPort = existingPorts.length > 0 ? Math.max(...existingPorts) + 1 : 8080;

    const payload = CreateBenchInputSchema.parse({
      ...rawInput,
      path: resolveUserPath(rawInput.path),
      status: 'queued',
      httpPort: nextPort,
    });
    const created = await repositories.benches.create(payload);
    operations.trackBenchOperation?.(created.id, 'create');
    
    // Spawn background orchestration task
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

    const updated = await repositories.benches.update(id, payload);
    if (updated) {
      operations.trackBenchOperation?.(updated.id, 'update');

      // Handle status transition orchestration. 
      // We allow 'running' even if already running to support 'Restart' action.
      if (payload.status && (payload.status !== existing?.status || payload.status === 'running')) {
        if (payload.status === 'running') {
          const isRestart = existing?.status === 'running';
          orchestrateBenchStart(updated, repositories.benches, isRestart);
        } else if (payload.status === 'stopped') {
          orchestrateBenchStop(updated, repositories.benches);
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

    orchestrateBenchDeletion(bench, repositories.benches, repositories.sites);
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
    if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
      return false;
    }

    orchestrateBenchCleaning(bench, repositories.sites);
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

    const updated = await repositories.sites.update(id, payload);
    if (updated) {
      operations.trackSiteOperation?.(updated.id, 'update');
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

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === site.benchId);
    if (bench && bench.status !== 'running' && bench.status !== 'success') {
      throw new Error(`Cannot delete site because its parent bench is not running. (Current status: ${bench.status})`);
    }

    const deleted = await orchestrateSiteDeletion(
      {
        sites: repositories.sites,
        benches: repositories.benches,
      },
      id
    );

    if (deleted) {
      operations.trackSiteOperation?.(id, 'delete');
    }
    return deleted;
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

  ipcMainLike.handle(ipcChannels.settingsGet, async () => {
    const settings = await repositories.settings.get();
    return settings ? toSettingsItem(settings) : null;
  });

  ipcMainLike.handle(ipcChannels.settingsSet, async (_event: unknown, input: unknown) => {
    const parsed = SettingsSchema.parse(input);
    const settings = await repositories.settings.set(parsed);
    return toSettingsItem(settings);
  });



  ipcMainLike.handle(ipcChannels.importValidatePackage, async (_event: unknown, input: unknown) => {
    const payload = input as { artifactDirectory?: unknown; benchId?: unknown };
    if (typeof payload?.artifactDirectory !== 'string' || payload.artifactDirectory.trim().length === 0) {
      throw new Error('Import package path is required.');
    }

    const parsedPackage = await parseImportPackage(payload.artifactDirectory.trim());
    const [settings, appCatalog] = await Promise.all([
      repositories.settings.get(),
      repositories.appCatalog.findAll(),
    ]);

    const selectedBench = typeof payload.benchId === 'string'
      ? await repositories.benches.findById(payload.benchId)
      : null;

    const compatibility = validateImportCompatibility(parsedPackage, {
      targetFrappeVersion: selectedBench?.frappeVersion ?? settings?.defaultFrappeVersion,
      availableAppIds: appCatalog.map((item) => item.id),
    });

    const response: ImportValidationResponse = {
      canImport: compatibility.canImport,
      summary: {
        packageVersion: parsedPackage.manifest.packageVersion,
        exportedAt: parsedPackage.manifest.exportedAt,
        siteName: parsedPackage.manifest.site.name,
        benchName: parsedPackage.manifest.bench.name,

        benchFrappeVersion: parsedPackage.manifest.bench.frappeVersion,
        requiredAppIds: parsedPackage.manifest.requiredApps.map((item) => item.id),
      },
      issues: compatibility.issues,
    };

    return response;
  });

  ipcMainLike.handle(ipcChannels.importExecutePackage, async (_event: unknown, input: unknown) => {
    const payload = input as ImportExecuteInput;
    if (typeof payload?.artifactDirectory !== 'string' || payload.artifactDirectory.trim().length === 0) {
      throw new Error('Import package path is required.');
    }

    if (typeof payload?.benchId !== 'string' || payload.benchId.trim().length === 0) {
      throw new Error('Target bench is required for import execution.');
    }

    if (payload.conflictPolicy !== 'block' && payload.conflictPolicy !== 'rename') {
      throw new Error('Unsupported conflict policy.');
    }

    const result = await executeImportPackage(
      {
        benches: repositories.benches,
        sites: repositories.sites,

        settings: repositories.settings,
        appCatalog: {
          findAll: async () => {
            const items = await repositories.appCatalog.findAll();
            return items.map((item) => ({
              ...item,
              category: (item.category ?? 'other') as 'other',
              icon: item.icon,
              compatibility: {
                ...item.compatibility,
              },
            }));
          },
        },
      },
      {
        artifactDirectory: payload.artifactDirectory.trim(),
        benchId: payload.benchId,
        conflictPolicy: payload.conflictPolicy,
      }
    );

    if (result.success && result.createdSiteId) {
      operations.trackSiteOperation?.(result.createdSiteId, 'create');
    }

    const response: ImportExecutionResponse = {
      success: result.success,
      createdSiteId: result.createdSiteId,
      siteName: result.siteName,
      conflictPolicyApplied: result.conflictPolicyApplied,
      steps: result.steps,
    };

    return response;
  });

  ipcMainLike.handle(ipcChannels.exportSitePackage, async (_event: unknown, input: unknown) => {
    const payload = input as ExportSitePackageInput;
    if (typeof payload?.siteId !== 'string' || payload.siteId.trim().length === 0) {
      throw new Error('Site ID is required for export.');
    }

    if (typeof payload?.outputDirectory !== 'string' || payload.outputDirectory.trim().length === 0) {
      throw new Error('Output directory is required for export.');
    }

    const result = await exportSitePackage(
      {
        benches: repositories.benches,
        sites: repositories.sites,

        settings: repositories.settings,
        appCatalog: {
          findAll: async () => {
            const items = await repositories.appCatalog.findAll();
            return items.map((item) => ({
              ...item,
              category: (item.category ?? 'other') as 'other',
              icon: item.icon,
              compatibility: {
                ...item.compatibility,
              },
            }));
          },
        },
        storageMetadata: {
          schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
          appCatalogSeedVersion: 0,
        },
      },
      {
        siteId: payload.siteId.trim(),
        outputDirectory: payload.outputDirectory.trim(),
      }
    );

    const response: ExportSitePackageResponse = {
      artifactDirectory: result.artifactDirectory,
      manifestPath: path.join(result.artifactDirectory, 'manifest.json'),
      payloadPath: path.join(result.artifactDirectory, 'payload.json'),
    };

    return response;
  });



  ipcMainLike.handle(ipcChannels.terminalCreate, async (_event: unknown, benchId: unknown, siteId: unknown) => {
    if (typeof benchId !== 'string') {
      throw new Error('Invalid bench ID');
    }

    const bench = await repositories.benches.findById(benchId);
    if (!bench) {
      throw new Error('Bench not found');
    }

    let workingDirectory = bench.path;
    let resolvedSiteId: string | null = null;

    if (typeof siteId === 'string') {
      const site = await repositories.sites.findById(siteId);
      if (!site || site.benchId !== benchId) {
        throw new Error('Site not found for bench');
      }
      workingDirectory = site.path;
      resolvedSiteId = site.id;
    }

    const result = terminalService.createSession({
      benchId,
      siteId: resolvedSiteId,
      workspacePath: workingDirectory,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Unable to create terminal session');
    }

    const response: TerminalCreateResponse = {
      sessionId: result.session!.id,
      state: result.session!.state,
      workingDirectory: result.session!.workingDirectory,
    };

    return response;
  });

  ipcMainLike.handle(ipcChannels.terminalWrite, async (_event: unknown, sessionId: unknown, data: unknown) => {
    if (typeof sessionId !== 'string' || typeof data !== 'string') {
      return false;
    }

    return terminalService.write(sessionId, data);
  });

  ipcMainLike.handle(ipcChannels.terminalClose, async (_event: unknown, sessionId: unknown, force: unknown) => {
    if (typeof sessionId !== 'string') {
      return false;
    }

    return terminalService.closeSession(sessionId, force === true);
  });

  ipcMainLike.handle(ipcChannels.terminalClear, async (_event: unknown, sessionId: unknown) => {
    if (typeof sessionId !== 'string') {
      return false;
    }

    return terminalService.clear(sessionId);
  });

  ipcMainLike.handle(ipcChannels.terminalResize, async (_event: unknown, sessionId: unknown, dimensions: unknown) => {
    if (typeof sessionId !== 'string' || !dimensions || typeof dimensions !== 'object') {
      return false;
    }

    const terminalDimensions = dimensions as { rows?: unknown; cols?: unknown };
    if (typeof terminalDimensions.rows !== 'number' || typeof terminalDimensions.cols !== 'number') {
      return false;
    }

    return terminalService.resize(sessionId, terminalDimensions.rows, terminalDimensions.cols);
  });

  ipcMainLike.handle(ipcChannels.terminalInspect, async (_event: unknown, sessionId: unknown) => {
    if (typeof sessionId !== 'string') {
      return null;
    }

    const session = terminalService.getSession(sessionId);
    if (!session) {
      return null;
    }

    const response: TerminalSessionInspection = {
      sessionId: session.id,
      state: session.state,
      workingDirectory: session.workingDirectory,
      contextBenchId: session.contextBenchId,
      contextSiteId: session.contextSiteId,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    };

    return response;
  });

  ipcMainLike.handle(ipcChannels.terminalOpenFolder, async (_event: unknown, benchId: unknown, siteId: unknown) => {
    if (typeof benchId !== 'string') {
      return false;
    }

    const bench = await repositories.benches.findById(benchId);
    if (!bench) {
      return false;
    }

    let targetPath = bench.path;
    if (typeof siteId === 'string') {
      const site = await repositories.sites.findById(siteId);
      if (!site || site.benchId !== benchId) {
        return false;
      }
      targetPath = site.path;
    }

    if (!operations.pathExists(targetPath)) {
      return false;
    }

    return operations.openPath(targetPath);
  });

  ipcMainLike.handle(ipcChannels.terminalOpenEditor, async (_event: unknown, benchId: unknown, siteId: unknown) => {
    if (typeof benchId !== 'string') {
      return false;
    }

    const bench = await repositories.benches.findById(benchId);
    if (!bench) {
      return false;
    }

    let targetPath = bench.path;
    if (typeof siteId === 'string') {
      const site = await repositories.sites.findById(siteId);
      if (!site || site.benchId !== benchId) {
        return false;
      }
      targetPath = site.path;
    }

    if (!operations.pathExists(targetPath)) {
      return false;
    }

    const settings = await repositories.settings.get();
    const editorPreference = settings?.editorPreference || 'code';
    return operations.openInEditor(targetPath, editorPreference);
  });

  ipcMainLike.handle(ipcChannels.terminalOpenDevcontainer, async (_event: unknown, benchId: unknown) => {
    if (typeof benchId !== 'string') {
      return false;
    }

    const bench = await repositories.benches.findById(benchId);
    if (!bench || !operations.pathExists(bench.path)) {
      return false;
    }

    const devcontainerTarget = findDevcontainerTarget(bench.path, operations.pathExists);
    if (!devcontainerTarget) {
      return false;
    }

    const settings = await repositories.settings.get();
    const editorPreference = settings?.editorPreference || 'code';
    return operations.openInEditor(devcontainerTarget, editorPreference);
  });
  ipcMainLike.handle(ipcChannels.utilsPathExists, async (_event: unknown, path: unknown) => {
    if (typeof path !== 'string') return false;
    return fs.existsSync(path);
  });
  ipcMainLike.handle(ipcChannels.utilsOpenExternal, async (_event: unknown, url: unknown) => {
    if (typeof url !== 'string') return;
    await operations.openExternal(url);
  });
};