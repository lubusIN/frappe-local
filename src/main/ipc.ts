import type { AppHealthResponse, CatalogAppItem } from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';
import type { AppCatalogRepository } from './storage/repositories/app-catalog-repository';

type IpcMainLike = {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
};

export type AppRepositories = {
  readonly appCatalog: AppCatalogRepository;
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
};