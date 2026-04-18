import { describe, it, expect } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogRepository } from '../src/main/storage/repositories/app-catalog-repository';
import type { AppCatalogItem, Settings } from '../src/shared/domain/models';

const catalogItems: AppCatalogItem[] = [
  {
    id: 'frappe',
    name: 'Frappe',
    description: 'Core framework',
    source: 'https://github.com/frappe/frappe',
    version: '15.0.0',
    compatibility: { supportedRuntimes: ['docker', 'podman'] },
  },
  {
    id: 'erpnext',
    name: 'ERPNext',
    description: 'ERP platform',
    source: 'https://github.com/frappe/erpnext',
    version: '15.0.0',
    compatibility: { supportedRuntimes: ['docker', 'podman'] },
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
    create: async (input: {
      name: string;
      path: string;
      frappeVersion: string;
      runtime: 'docker' | 'podman';
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
    update: async (_id: string) => null,
  };
}

function makeStubSiteRepo() {
  return {
    findAll: async () => [],
    create: async (input: {
      name: string;
      benchId: string;
      groupId: string | null;
      apps: string[];
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path: string;
    }) => ({
      id: 'site-stub',
      ...input,
      timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
    update: async (_id: string) => null,
  };
}

function makeStubSettingsRepo() {
  let current: Settings | null = null;
  return {
    get: async () => current,
    set: async (input: Settings) => {
      current = input;
      return input;
    },
  };
}

function makeStubGroupRepo() {
  return {
    findAll: async () => [],
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
      groups: makeStubGroupRepo(),
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
