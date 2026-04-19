import type {
  AppHealthResponse,
  BenchCreateInput,
  BenchListItem,
  BenchUpdateInput,
  ImportExecuteInput,
  ImportExecutionResponse,
  ImportValidationResponse,
  RuntimeHealthResponse,
  RuntimeRepairInput,
  RuntimeRepairResponse,
  ExportSitePackageInput,
  ExportSitePackageResponse,
  CatalogAppItem,
  LifecycleLogItem,
  SettingsItem,
  SiteCreateInput,
  SiteListItem,
  SiteUpdateInput,
  WorkspaceCreateInput,
  WorkspaceListItem,
  TerminalErrorEvent,
  TerminalSessionInspection,
  TerminalOutputEvent,
  WorkspaceUpdateInput,
  TerminalStateChangeEvent,
} from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';
import type { TerminalCreateResponse } from '../shared/ipc';
import type { TaskProgressEvent } from '../shared/domain/task-runner';
import { getTerminalService } from './terminal-service';
import { getTaskRunner } from './task-runner';
import { RuntimeService } from './runtime-service';
import { CURRENT_STORAGE_SCHEMA_VERSION } from './storage/schema';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import {
  CreateBenchInputSchema,
  CreateGroupInputSchema,
  CreateSiteInputSchema,
  SettingsSchema,
  UpdateBenchInputSchema,
  UpdateGroupInputSchema,
  UpdateSiteInputSchema,
  type Bench,
  type Group,
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
import { orchestrateSiteCreation } from './site-orchestration';
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

type RuntimeServiceLike = {
  getHealth: () => Promise<RuntimeHealthResponse>;
  startRepair: (input: RuntimeRepairInput) => Promise<RuntimeRepairResponse>;
};

export type AppRepositories = {
  readonly appCatalog: {
    findAll: () => Promise<Array<{
      id: string;
      name: string;
      description: string;
      source: string;
      version: string;
      compatibility: {
        minimumFrappeVersion?: string;
        maximumFrappeVersion?: string;
        supportedRuntimes: readonly ('docker' | 'podman')[];
      };
    }>>;
    findById: (id: string) => Promise<{
      id: string;
      name: string;
      description: string;
      source: string;
      version: string;
      compatibility: {
        minimumFrappeVersion?: string;
        maximumFrappeVersion?: string;
        supportedRuntimes: readonly ('docker' | 'podman')[];
      };
    } | null>;
    search: (query: string) => Promise<Array<{
      id: string;
      name: string;
      description: string;
      source: string;
      version: string;
      compatibility: {
        minimumFrappeVersion?: string;
        maximumFrappeVersion?: string;
        supportedRuntimes: readonly ('docker' | 'podman')[];
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
      runtime: 'docker' | 'podman';
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      apps: string[];
    }) => Promise<Bench>;
    update: (id: string, input: {
      name?: string;
      path?: string;
      frappeVersion?: string;
      runtime?: 'docker' | 'podman';
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
  readonly groups: {
    findAll: () => Promise<Group[]>;
    create: (input: {
      name: string;
      description: string;
      tags: string[];
      siteIds: string[];
    }) => Promise<Group>;
    update: (id: string, input: {
      name?: string;
      description?: string;
      tags?: string[];
      siteIds?: string[];
    }) => Promise<Group | null>;
    delete: (id: string) => Promise<boolean>;
  };
};

export type IpcOperations = {
  readonly openPath: (targetPath: string) => Promise<boolean>;
  readonly openInEditor: (targetPath: string, editorPreference: string) => Promise<boolean>;
  readonly pathExists: (targetPath: string) => boolean;
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
  compatibility: {
    minimumFrappeVersion?: string;
    maximumFrappeVersion?: string;
    supportedRuntimes: readonly ('docker' | 'podman')[];
  };
}): CatalogAppItem => ({
  id: item.id,
  name: item.name,
  description: item.description,
  source: item.source,
  version: item.version,
  compatibility: {
    minimumFrappeVersion: item.compatibility.minimumFrappeVersion,
    maximumFrappeVersion: item.compatibility.maximumFrappeVersion,
    supportedRuntimes: [...item.compatibility.supportedRuntimes],
  },
});

const toBenchListItem = (bench: Bench): BenchListItem => ({
  id: bench.id,
  name: bench.name,
  path: bench.path,
  frappeVersion: bench.frappeVersion,
  runtime: bench.runtime,
  status: bench.status,
  appCount: bench.apps.length,
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
  runtimePreference: settings.runtimePreference,
  storagePath: settings.storagePath,
  terminalPreference: settings.terminalPreference,
  editorPreference: settings.editorPreference,
  updateChannel: settings.updateChannel,
  autoUpdateEnabled: settings.autoUpdateEnabled,
});

const toWorkspaceListItem = (group: Group): WorkspaceListItem => ({
  id: group.id,
  name: group.name,
  description: group.description,
  tags: group.tags,
  siteCount: group.siteIds.length,
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
  runtimeService: RuntimeServiceLike = new RuntimeService({
    settings: repositories.settings,
    taskRunner: getTaskRunner(),
  })
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

  ipcMainLike.handle(ipcChannels.benchesCreate, async (_event: unknown, input: unknown) => {
    const payload = CreateBenchInputSchema.parse({
      ...(input as BenchCreateInput),
      status: 'stopped',
    });
    const created = await repositories.benches.create(payload);
    operations.trackBenchOperation?.(created.id, 'create');
    return toBenchListItem(created);
  });

  ipcMainLike.handle(ipcChannels.benchesUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    const payload = UpdateBenchInputSchema.parse(input as BenchUpdateInput);
    const updated = await repositories.benches.update(id, payload);
    if (updated) {
      operations.trackBenchOperation?.(updated.id, 'update');
    }
    return updated ? toBenchListItem(updated) : null;
  });

  ipcMainLike.handle(ipcChannels.benchesDelete, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || bench.status === 'running') {
      return false;
    }

    const sites = await repositories.sites.findAll();
    const hasAttachedSites = sites.some((site) => site.benchId === id);
    if (hasAttachedSites) {
      return false;
    }

    const deleted = await repositories.benches.delete(id);
    if (deleted) {
      operations.trackBenchOperation?.(id, 'delete');
    }
    return deleted;
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
      return false;
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site || site.status === 'running') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === site.benchId);
    if (!bench || !canAttachSiteToBench(bench.status)) {
      return false;
    }

    const deleted = await repositories.sites.delete(id);
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

  ipcMainLike.handle(ipcChannels.runtimeGetHealth, async (): Promise<RuntimeHealthResponse> => {
    return runtimeService.getHealth();
  });

  ipcMainLike.handle(ipcChannels.runtimeRepair, async (_event: unknown, input: unknown): Promise<RuntimeRepairResponse> => {
    const payload = (input ?? {}) as RuntimeRepairInput;
    if (
      payload.runtimePreference !== undefined &&
      payload.runtimePreference !== 'docker' &&
      payload.runtimePreference !== 'podman'
    ) {
      throw new Error('Unsupported runtime preference.');
    }

    if (payload.dryRun !== undefined && typeof payload.dryRun !== 'boolean') {
      throw new Error('Repair dryRun flag must be a boolean.');
    }

    return runtimeService.startRepair(payload);
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
      targetRuntime: selectedBench?.runtime ?? settings?.runtimePreference,
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
        benchRuntime: parsedPackage.manifest.bench.runtime,
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
        groups: repositories.groups,
        settings: repositories.settings,
        appCatalog: {
          findAll: async () => {
            const items = await repositories.appCatalog.findAll();
            return items.map((item) => ({
              ...item,
              compatibility: {
                ...item.compatibility,
                supportedRuntimes: [...item.compatibility.supportedRuntimes],
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
        groups: repositories.groups,
        settings: repositories.settings,
        appCatalog: {
          findAll: async () => {
            const items = await repositories.appCatalog.findAll();
            return items.map((item) => ({
              ...item,
              compatibility: {
                ...item.compatibility,
                supportedRuntimes: [...item.compatibility.supportedRuntimes],
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

  ipcMainLike.handle(ipcChannels.workspacesList, async () => {
    const groups = await repositories.groups.findAll();
    return groups.map(toWorkspaceListItem);
  });

  ipcMainLike.handle(ipcChannels.workspacesCreate, async (_event: unknown, input: unknown) => {
    const payload = CreateGroupInputSchema.parse({
      ...(input as WorkspaceCreateInput),
      siteIds: [],
    });
    const created = await repositories.groups.create(payload);
    return toWorkspaceListItem(created);
  });

  ipcMainLike.handle(ipcChannels.workspacesUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    const payload = UpdateGroupInputSchema.parse(input as WorkspaceUpdateInput);
    const updated = await repositories.groups.update(id, payload);
    return updated ? toWorkspaceListItem(updated) : null;
  });

  ipcMainLike.handle(ipcChannels.workspacesDelete, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    return repositories.groups.delete(id);
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
};