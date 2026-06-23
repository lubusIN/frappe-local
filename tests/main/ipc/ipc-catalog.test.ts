import { describe, it, expect } from 'vitest';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { AppCatalogRepository } from '../../../src/main/storage/repositories/app-catalog-repository';
import type { AppCatalogItem, Settings } from '../../../src/shared/domain/models';

const catalogItems: AppCatalogItem[] = [
  {
    id: 'frappe',
    name: 'Frappe',
    description: 'Core framework',
    source: 'https://github.com/frappe/frappe',
    version: '15.0.0',
    category: 'core',
    compatibility: {},
  },
  {
    id: 'erpnext',
    name: 'ERPNext',
    description: 'ERP platform',
    source: 'https://github.com/frappe/erpnext',
    version: '15.0.0',
    category: 'business',
    compatibility: {},
  },
];

function makeStubCatalogRepo(items: AppCatalogItem[]): AppCatalogRepository {
  return {
    findAll: async () => items,
    findById: async (id: string) => items.find((i) => i.id === id) ?? null,
    search: async (q: string) => {
      const n = q.trim().toLowerCase();
      return n ? items.filter((i) => i.name.toLowerCase().includes(n)) : items;
    },
  } as AppCatalogRepository;
}

function makeStubBenchRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    create: async (input: {
      name: string;
      path: string;
      frappeVersion: string;
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      apps: string[];
    }) => ({
      id: 'bench-stub',
      ...input,
      timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
    update: async () => null,
    delete: async () => false,
  };
}

function makeStubSiteRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    create: async (input: {
      name: string;
      benchId: string;
      apps: string[];
      status: 'queued' | 'ready' | 'failure';
      path: string;
    }) => ({
      id: 'site-stub',
      ...input,
      timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
    update: async () => null,
    delete: async () => false,
  };
}

function makeStubSettingsRepo() {
  let current: Settings | null = null;
  return {
    get: async () => current,
    set: async (input: Partial<Settings>) => {
      current = input as Settings;
      return current;
    },
  };
}

function makeStubCustomAppsRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    create: async () => ({} as any),
    update: async () => null,
    delete: async () => false,
  };
}

function buildHandlers(items: AppCatalogItem[] = catalogItems) {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
  registerIpcHandlers(
    { handle: (channel, listener) => { handlers.set(channel, listener); } },
    {
      appCatalog: makeStubCatalogRepo(items),
      benches: makeStubBenchRepo(),
      sites: makeStubSiteRepo(),
      settings: makeStubSettingsRepo(),
      customApps: makeStubCustomAppsRepo(),
    }
  );
  return handlers;
}

describe('catalog IPC handlers', () => {
  it('catalog:list returns all items', async () => {
    const handlers = buildHandlers();
    const result = await handlers.get(ipcChannels.catalogList)?.() as unknown[];
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'frappe', name: 'Frappe' });
  });

  it('catalog:find-by-id returns the matching item', async () => {
    const handlers = buildHandlers();
    const result = await handlers.get(ipcChannels.catalogFindById)?.(undefined, 'erpnext');
    expect(result).toMatchObject({ id: 'erpnext', name: 'ERPNext' });
  });

  it('catalog:find-by-id returns null for unknown id', async () => {
    const handlers = buildHandlers();
    const result = await handlers.get(ipcChannels.catalogFindById)?.(undefined, 'unknown');
    expect(result).toBeNull();
  });

  it('catalog:find-by-id returns null for non-string id', async () => {
    const handlers = buildHandlers();
    const result = await handlers.get(ipcChannels.catalogFindById)?.(undefined, 42);
    expect(result).toBeNull();
  });

  it('catalog:search filters items by query', async () => {
    const handlers = buildHandlers();
    const result = await handlers.get(ipcChannels.catalogSearch)?.(undefined, 'frappe') as unknown[];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'frappe' });
  });

  it('catalog:search with empty string returns all items', async () => {
    const handlers = buildHandlers();
    const result = await handlers.get(ipcChannels.catalogSearch)?.(undefined, '') as unknown[];
    expect(result).toHaveLength(2);
  });

  it('catalog:list returns empty array when catalog is empty', async () => {
    const handlers = buildHandlers([]);
    const result = await handlers.get(ipcChannels.catalogList)?.() as unknown[];
    expect(result).toEqual([]);
  });
});
