import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Settings, Site } from '../src/shared/domain/models';

const sites: Site[] = [
  {
    id: 'site-001',
    name: 'demo.localhost',
    benchId: 'bench-001',
    groupId: null,
    apps: ['frappe', 'erpnext'],
    status: 'running',
    path: '/Users/dev/frappe-bench/sites/demo.localhost',
    timestamps: {
      createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
    },
  },
];

function makeStubCatalogRepo(items: AppCatalogItem[] = []) {
  return {
    findAll: async () => items,
    findById: async (id: string) => items.find((i) => i.id === id) ?? null,
    search: async (query: string) => items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())),
  };
}

function makeStubBenchRepo() {
  return {
    findAll: async () => [],
  };
}

function makeStubSiteRepo(items: Site[] = sites) {
  return {
    findAll: async () => items,
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

describe('sites IPC handlers', () => {
  it('sites:list returns mapped site list items', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      }
    );

    const listHandler = handlers.get(ipcChannels.sitesList);

    expect(listHandler).toBeTypeOf('function');

    const result = await listHandler?.();

    expect(result).toEqual([
      {
        id: 'site-001',
        name: 'demo.localhost',
        benchId: 'bench-001',
        groupId: null,
        status: 'running',
        path: '/Users/dev/frappe-bench/sites/demo.localhost',
        appCount: 2,
        createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
      },
    ]);
  });

  it('sites:list returns an empty array when no sites exist', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([]),
        settings: makeStubSettingsRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.sitesList)?.();

    expect(result).toEqual([]);
  });
});
