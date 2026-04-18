import { describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Bench, Settings, Site } from '../src/shared/domain/models';

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
  let current = [...items];

  return {
    findAll: async () => current,
    create: async (input: {
      name: string;
      path: string;
      frappeVersion: string;
      runtime: 'docker' | 'podman';
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      apps: string[];
    }) => {
      const created: Bench = {
        id: `bench-${current.length + 1}`,
        ...input,
        timestamps: {
          createdAt: new Date('2026-01-10T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-01-10T00:00:00.000Z').toISOString(),
        },
      };
      current = [created, ...current];
      return created;
    },
    update: async (id: string, input: {
      name?: string;
      path?: string;
      frappeVersion?: string;
      runtime?: 'docker' | 'podman';
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      apps?: string[];
    }) => {
      const index = current.findIndex((bench) => bench.id === id);
      if (index === -1) {
        return null;
      }

      const existing = current[index]!;
      const updated: Bench = {
        ...existing,
        name: input.name ?? existing.name,
        path: input.path ?? existing.path,
        frappeVersion: input.frappeVersion ?? existing.frappeVersion,
        runtime: input.runtime ?? existing.runtime,
        status: input.status ?? existing.status,
        apps: input.apps ?? existing.apps,
        timestamps: {
          ...existing.timestamps,
          updatedAt: new Date('2026-01-11T00:00:00.000Z').toISOString(),
        },
      };
      current[index] = updated;
      return updated;
    },
    delete: async (id: string) => {
      const exists = current.some((bench) => bench.id === id);
      if (!exists) {
        return false;
      }
      current = current.filter((bench) => bench.id !== id);
      return true;
    },
  };
}

function makeStubSiteRepo(items: Site[] = []) {
  return {
    findAll: async () => items,
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
    update: async () => null,
    delete: async () => false,
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
    create: async (input: { name: string; description: string; tags: string[]; siteIds: string[] }) => ({
      id: 'group-new',
      ...input,
    }),
    update: async (id: string, input: { name?: string; description?: string; tags?: string[]; siteIds?: string[] }) => null,
    delete: async (id: string) => false,
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
        groups: makeStubGroupRepo(),
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
        groups: makeStubGroupRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.benchesList)?.();

    expect(result).toEqual([]);
  });

  it('benches:create creates a stopped bench and returns list item shape', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const createHandler = handlers.get(ipcChannels.benchesCreate);
    const created = await createHandler?.(undefined, {
      name: 'new-bench',
      path: '/Users/dev/new-bench',
      frappeVersion: '15.0.0',
      runtime: 'docker',
      apps: ['frappe'],
    });

    expect(created).toMatchObject({
      name: 'new-bench',
      path: '/Users/dev/new-bench',
      frappeVersion: '15.0.0',
      runtime: 'docker',
      status: 'stopped',
      appCount: 1,
    });
  });

  it('benches:update updates bench status and returns list item shape', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([
          {
            ...benches[0]!,
            status: 'stopped',
          },
        ]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const updateHandler = handlers.get(ipcChannels.benchesUpdate);
    const updated = await updateHandler?.(undefined, 'bench-001', { status: 'stopped' });

    expect(updated).toMatchObject({
      id: 'bench-001',
      status: 'stopped',
    });
  });

  it('benches:delete deletes a stopped bench with no sites attached', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([
          {
            ...benches[0]!,
            status: 'stopped',
          },
        ]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const deleteHandler = handlers.get(ipcChannels.benchesDelete);
    const deleted = await deleteHandler?.(undefined, 'bench-001');

    expect(deleted).toBe(true);
  });

  it('benches:delete is blocked when sites are attached', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([
          {
            ...benches[0]!,
            status: 'stopped',
          },
        ]),
        sites: makeStubSiteRepo([
          {
            id: 'site-001',
            name: 'demo.localhost',
            benchId: 'bench-001',
            groupId: null,
            apps: ['frappe'],
            status: 'stopped',
            path: '/Users/dev/frappe-bench/sites/demo.localhost',
            timestamps: {
              createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
            },
          },
        ]),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const deleteHandler = handlers.get(ipcChannels.benchesDelete);
    const deleted = await deleteHandler?.(undefined, 'bench-001');

    expect(deleted).toBe(false);
  });

  it('benches:logs returns lifecycle entries for a bench', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const logsHandler = handlers.get(ipcChannels.benchesLogs);
    const logs = await logsHandler?.(undefined, 'bench-001');

    expect(Array.isArray(logs)).toBe(true);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: 'bench-001' }),
      ])
    );
  });

  it('benches:open-folder opens when path exists', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const openPath = vi.fn(async () => true);

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([
          {
            ...benches[0]!,
            path: process.cwd(),
          },
        ]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      { openPath }
    );

    const openFolderHandler = handlers.get(ipcChannels.benchesOpenFolder);
    const opened = await openFolderHandler?.(undefined, 'bench-001');

    expect(opened).toBe(true);
    expect(openPath).toHaveBeenCalled();
  });
});
