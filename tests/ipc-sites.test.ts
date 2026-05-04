import { describe, expect, it, vi } from 'vitest';
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
  const benches = [
    {
      id: 'bench-001',
      name: 'frappe-bench',
      path: '/Users/dev/frappe-bench',
      frappeVersion: '15.0.0',
      runtime: 'podman' as const,
      status: 'running' as const,
      apps: ['frappe'],
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
      },
    },
  ];

  return {
    findAll: async () => benches,
    findById: async (id: string) => benches.find((bench) => bench.id === id) ?? null,
    create: async (input: {
      name: string;
      path: string;
      frappeVersion: string;
      runtime: 'podman';
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

function makeStubSiteRepo(items: Site[] = sites) {
  let current = [...items];

  return {
    findAll: async () => current,
    findById: async (id: string) => current.find((site) => site.id === id) ?? null,
    create: async (input: {
      name: string;
      benchId: string;
      groupId: string | null;
      apps: string[];
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path: string;
    }) => {
      const created: Site = {
        id: `site-${current.length + 1}`,
        ...input,
        timestamps: {
          createdAt: new Date('2026-02-10T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-02-10T00:00:00.000Z').toISOString(),
        },
      };
      current = [created, ...current];
      return created;
    },
    update: async (id: string, input: {
      name?: string;
      benchId?: string;
      groupId?: string | null;
      apps?: string[];
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path?: string;
    }) => {
      const index = current.findIndex((site) => site.id === id);
      if (index === -1) {
        return null;
      }

      const existing = current[index]!;
      const updated: Site = {
        ...existing,
        name: input.name ?? existing.name,
        benchId: input.benchId ?? existing.benchId,
        groupId: input.groupId ?? existing.groupId,
        apps: input.apps ?? existing.apps,
        status: input.status ?? existing.status,
        path: input.path ?? existing.path,
        timestamps: {
          ...existing.timestamps,
          updatedAt: new Date('2026-02-11T00:00:00.000Z').toISOString(),
        },
      };
      current[index] = updated;
      return updated;
    },
    delete: async (id: string) => {
      const exists = current.some((site) => site.id === id);
      if (!exists) {
        return false;
      }
      current = current.filter((site) => site.id !== id);
      return true;
    },
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
    update: async () => null,
    delete: async () => false,
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
        groups: makeStubGroupRepo(),
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
        groups: makeStubGroupRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.sitesList)?.();

    expect(result).toEqual([]);
  });

  it('sites:create creates a stopped site and returns list item shape', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const trackSiteOperation = vi.fn();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([]),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      { openPath: async () => false, openInEditor: async () => false, pathExists: () => true, trackSiteOperation }
    );

    const createHandler = handlers.get(ipcChannels.sitesCreate);
    const created = await createHandler?.(undefined, {
      name: 'new.localhost',
      benchId: 'bench-001',
      groupId: null,
      path: '/Users/dev/frappe-bench/sites/new.localhost',
      apps: ['frappe'],
    });

    expect(created).toMatchObject({
      name: 'new.localhost',
      benchId: 'bench-001',
      groupId: null,
      status: 'queued',
      path: '/Users/dev/frappe-bench/sites/new.localhost',
    });
    expect(trackSiteOperation).toHaveBeenCalledWith(expect.any(String), 'create');
  });

  it('sites:create fails when bench does not exist', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([]),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const createHandler = handlers.get(ipcChannels.sitesCreate);

    await expect(
      createHandler?.(undefined, {
        name: 'bad.localhost',
        benchId: 'unknown-bench',
        groupId: null,
        path: '/Users/dev/frappe-bench/sites/bad.localhost',
        apps: ['frappe'],
      })
    ).rejects.toThrow('parent bench was not found');
  });

  it('sites:update updates site status and returns list item shape', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            status: 'stopped',
          },
        ]),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);
    const updated = await updateHandler?.(undefined, 'site-001', { status: 'stopped' });

    expect(updated).toMatchObject({
      id: 'site-001',
      status: 'stopped',
    });
  });

  it('sites:update blocks invalid status transition', async () => {
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

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);
    const updated = await updateHandler?.(undefined, 'site-001', { status: 'success' });

    expect(updated).toBeNull();
  });

  it('sites:delete deletes a stopped site', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            status: 'stopped',
          },
        ]),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const deleteHandler = handlers.get(ipcChannels.sitesDelete);
    const deleted = await deleteHandler?.(undefined, 'site-001');

    expect(deleted).toBe(true);
  });

  it('sites:delete is blocked when site is running', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            status: 'running',
          },
        ]),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      }
    );

    const deleteHandler = handlers.get(ipcChannels.sitesDelete);
    const deleted = await deleteHandler?.(undefined, 'site-001');

    expect(deleted).toBe(false);
  });

  it('sites:logs returns lifecycle entries for a site', async () => {
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

    const logsHandler = handlers.get(ipcChannels.sitesLogs);
    const logs = await logsHandler?.(undefined, 'site-001');

    expect(Array.isArray(logs)).toBe(true);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: 'site-001' }),
      ])
    );
  });

  it('sites:open-folder opens when path exists', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const openPath = vi.fn(async () => true);
    const trackSiteOperation = vi.fn();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            path: process.cwd(),
          },
        ]),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      { openPath, openInEditor: async () => false, pathExists: () => true, trackSiteOperation }
    );

    const openFolderHandler = handlers.get(ipcChannels.sitesOpenFolder);
    const opened = await openFolderHandler?.(undefined, 'site-001');

    expect(opened).toBe(true);
    expect(openPath).toHaveBeenCalled();
    expect(trackSiteOperation).toHaveBeenCalledWith('site-001', 'open-folder');
  });
});
