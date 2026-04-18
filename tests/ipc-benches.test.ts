import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Bench, Settings } from '../src/shared/domain/models';

const benches: Bench[] = [
  {
    id: 'bench-001',
    name: 'frappe-bench',
    path: '/Users/dev/frappe-bench',
    frappeVersion: '15.0.0',
    runtime: 'docker',
    status: 'running',
    apps: ['frappe', 'erpnext'],
    timestamps: {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
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

function makeStubBenchRepo(items: Bench[] = benches) {
  return {
    findAll: async () => items,
  };
}

function makeStubSiteRepo() {
  return {
    findAll: async () => [],
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

describe('benches IPC handlers', () => {
  it('benches:list returns mapped bench list items', async () => {
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

    const listHandler = handlers.get(ipcChannels.benchesList);

    expect(listHandler).toBeTypeOf('function');

    const result = await listHandler?.();

    expect(result).toEqual([
      {
        id: 'bench-001',
        name: 'frappe-bench',
        path: '/Users/dev/frappe-bench',
        frappeVersion: '15.0.0',
        runtime: 'docker',
        status: 'running',
        appCount: 2,
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
      },
    ]);
  });

  it('benches:list returns an empty array when no benches exist', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.benchesList)?.();

    expect(result).toEqual([]);
  });
});
