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
  WorkspaceListItem,
} from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';
import fs from 'node:fs';
import {
  CreateBenchInputSchema,
  CreateSiteInputSchema,
  SettingsSchema,
  UpdateBenchInputSchema,
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

type IpcMainLike = {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
};

export type AppRepositories = {
  readonly appCatalog: {
    findAll: () => Promise<Array<{ id: string; name: string; description: string; source: string; version: string }>>;
    findById: (id: string) => Promise<{ id: string; name: string; description: string; source: string; version: string } | null>;
    search: (query: string) => Promise<Array<{ id: string; name: string; description: string; source: string; version: string }>>;
  };
  readonly benches: {
    findAll: () => Promise<Bench[]>;
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
  };
};

export type IpcOperations = {
  readonly openPath: (targetPath: string) => Promise<boolean>;
  readonly trackBenchOperation?: (benchId: string, operation: BenchLifecycleOperation) => void;
};

export const buildAppHealthResponse = (): AppHealthResponse => ({
  appName: 'Frappe Cafe',
  platform: process.platform,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  timestamp: new Date().toISOString(),
});

const toCatalogAppItem = (item: { id: string; name: string; description: string; source: string; version: string }): CatalogAppItem => ({
  id: item.id,
  name: item.name,
  description: item.description,
  source: item.source,
  version: item.version,
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

export const registerIpcHandlers = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations = {
    openPath: async () => false,
    trackBenchOperation: () => undefined,
  }
): void => {
  ipcMainLike.handle(ipcChannels.appHealthCheck, async () => buildAppHealthResponse());

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

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === payload.benchId);
    if (!bench) {
      throw new Error('Cannot create site: parent bench was not found.');
    }

    if (!canAttachSiteToBench(bench.status)) {
      throw new Error('Cannot create site: parent bench is not ready.');
    }

    const created = await repositories.sites.create(payload);
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

    return repositories.sites.delete(id);
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

    return toLifecycleLogs(
      site.id,
      site.status,
      site.path,
      site.timestamps.createdAt,
      site.timestamps.updatedAt
    );
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

    return operations.openPath(site.path);
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

  ipcMainLike.handle(ipcChannels.workspacesList, async () => {
    const groups = await repositories.groups.findAll();
    return groups.map(toWorkspaceListItem);
  });
};