import type {
  AppHealthResponse,
  BenchListItem,
  CatalogAppItem,
  SettingsItem,
  SiteListItem,
  WorkspaceListItem,
} from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';
import { SettingsSchema, type Bench, type Group, type Settings, type Site } from '../shared/domain/models';

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
  };
  readonly sites: {
    findAll: () => Promise<Site[]>;
  };
  readonly settings: {
    get: () => Promise<Settings | null>;
    set: (input: Settings) => Promise<Settings>;
  };
  readonly groups: {
    findAll: () => Promise<Group[]>;
  };
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

export const registerIpcHandlers = (ipcMainLike: IpcMainLike, repositories: AppRepositories): void => {
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

  ipcMainLike.handle(ipcChannels.sitesList, async () => {
    const sites = await repositories.sites.findAll();
    return sites.map(toSiteListItem);
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