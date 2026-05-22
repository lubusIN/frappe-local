import { describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { AppCatalogItem, Settings, Site } from '../../../src/shared/domain/models';

const sites: Site[] = [
  {
    id: 'site-001',
    name: 'demo.localhost',
    benchId: 'bench-001',
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

function makeStubBenchRepo(apps: string[] = ['frappe']) {
  const benches = [
    {
      id: 'bench-001',
      name: 'frappe-bench',
      path: '/Users/dev/frappe-bench',
      frappeVersion: '15.0.0',
      status: 'running' as const,
      apps,
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
    set: async (input: Partial<Settings>) => {
      current = { ...current, ...input } as Settings;
      return current;
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
        status: 'running',
        path: '/Users/dev/frappe-bench/sites/demo.localhost',
        appCount: 2,
        apps: ['frappe', 'erpnext'],
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

  it('sites:list sorts newest sites first by creation time', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            id: 'site-old',
            name: 'old.localhost',
            timestamps: {
              createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
            },
          },
          {
            ...sites[0]!,
            id: 'site-new',
            name: 'new.localhost',
            timestamps: {
              createdAt: new Date('2026-02-03T00:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-02-03T00:00:00.000Z').toISOString(),
            },
          },
        ]),
        settings: makeStubSettingsRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.sitesList)?.() as Array<{ id: string }>;

    expect(result.map((site) => site.id)).toEqual(['site-new', 'site-old']);
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
      },
      { openPath: async () => false, openInEditor: async () => false, openExternal: async () => false, pathExists: () => true, trackSiteOperation }
    );

    const createHandler = handlers.get(ipcChannels.sitesCreate);
    const created = await createHandler?.(undefined, {
      name: 'new.localhost',
      benchId: 'bench-001',
      path: '/Users/dev/frappe-bench/sites/new.localhost',
      apps: ['frappe'],
    });

    expect(created).toMatchObject({
      name: 'new.localhost',
      benchId: 'bench-001',
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
      }
    );

    const createHandler = handlers.get(ipcChannels.sitesCreate);

    await expect(
      createHandler?.(undefined, {
        name: 'bad.localhost',
        benchId: 'unknown-bench',
        path: '/Users/dev/frappe-bench/sites/bad.localhost',
        apps: ['frappe'],
      })
    ).rejects.toThrow('parent bench was not found');
  });

  it('sites:create rejects apps that are not installed on the selected bench', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(['frappe', 'erpnext']),
        sites: makeStubSiteRepo([]),
        settings: makeStubSettingsRepo(),
      }
    );

    const createHandler = handlers.get(ipcChannels.sitesCreate);

    await expect(
      createHandler?.(undefined, {
        name: 'bad.localhost',
        benchId: 'bench-001',
        path: '/Users/dev/frappe-bench/sites/bad.localhost',
        apps: ['frappe', 'wiki'],
      })
    ).rejects.toThrow('Cannot create site with apps not installed on bench: wiki');
  });

  it('sites:create blocks duplicate canonical host across benches', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            name: 'frappevault.localhost',
            benchId: 'bench-001',
          },
        ]),
        settings: makeStubSettingsRepo(),
      }
    );

    const createHandler = handlers.get(ipcChannels.sitesCreate);

    await expect(
      createHandler?.(undefined, {
        name: 'frappevault.local.local',
        benchId: 'bench-001',
        path: '/Users/dev/frappe-bench/sites/frappevault.local.local',
        apps: ['frappe'],
      })
    ).rejects.toThrow('already exists');
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
      }
    );

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);
    const updated = await updateHandler?.(undefined, 'site-001', { status: 'stopped' });

    expect(updated).toMatchObject({
      id: 'site-001',
      status: 'stopped',
    });
  });

  it('sites:update with apps queues site app activation without optimistic persistence', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(['frappe', 'erpnext']),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            apps: ['frappe'],
            status: 'running',
          },
        ]),
        settings: makeStubSettingsRepo(),
      }
    );

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);
    const updated = await updateHandler?.(undefined, 'site-001', { apps: ['frappe', 'erpnext'] }) as {
      status: string;
      appCount: number;
      apps?: string[];
    };

    expect(updated.status).toBe('queued');
    expect(updated.appCount).toBe(1);
    expect(updated.apps).toEqual(['frappe']);
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
      }
    );

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);
    const updated = await updateHandler?.(undefined, 'site-001', { status: 'success' });

    expect(updated).toBeNull();
  });

  it('sites:update blocks renaming to an existing canonical host', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            id: 'site-001',
            name: 'frappevault.localhost',
          },
          {
            ...sites[0]!,
            id: 'site-002',
            name: 'erp.localhost',
            path: '/Users/dev/frappe-bench/sites/erp.localhost',
          },
        ]),
        settings: makeStubSettingsRepo(),
      }
    );

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);

    await expect(
      updateHandler?.(undefined, 'site-002', { name: 'frappevault.local.local' })
    ).rejects.toThrow('already exists');
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
      }
    );

    const deleteHandler = handlers.get(ipcChannels.sitesDelete);

    await expect(deleteHandler?.(undefined, 'site-001')).rejects.toThrow(
      'Cannot delete a running site. Please stop it first.'
    );
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
      },
      { openPath, openInEditor: async () => false, openExternal: async () => false, pathExists: () => true, trackSiteOperation }
    );

    const openFolderHandler = handlers.get(ipcChannels.sitesOpenFolder);
    const opened = await openFolderHandler?.(undefined, 'site-001');

    expect(opened).toBe(true);
    expect(openPath).toHaveBeenCalled();
    expect(trackSiteOperation).toHaveBeenCalledWith('site-001', 'open-folder');
  });

  it('sites:open-external routes through the Caddy front door over https', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const openExternal = vi.fn(async () => true);

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      },
      {
        openPath: async () => false,
        openInEditor: async () => false,
        openExternal,
        pathExists: () => true,
        isFrontDoorAvailable: () => true,
      }
    );

    const openSiteHandler = handlers.get(ipcChannels.sitesOpenExternal);
    const opened = await openSiteHandler?.(undefined, 'site-001');

    expect(opened).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://demo.localhost');
  });

  it('sites:open-external normalizes .local host and falls back to bench port', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const openExternal = vi.fn(async () => true);

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo([
          {
            ...sites[0]!,
            name: 'my-site.local.local',
          },
        ]),
        settings: makeStubSettingsRepo(),
      },
      {
        openPath: async () => false,
        openInEditor: async () => false,
        openExternal,
        pathExists: () => true,
      }
    );

    const openSiteHandler = handlers.get(ipcChannels.sitesOpenExternal);
    const opened = await openSiteHandler?.(undefined, 'site-001');

    expect(opened).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('http://my-site.localhost:8080');
  });

  it('refreshes front door hosts after site create and update', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const refreshFrontDoorHosts = vi.fn(async () => undefined);

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
      },
      {
        openPath: async () => false,
        openInEditor: async () => false,
        openExternal: async () => false,
        pathExists: () => true,
        refreshFrontDoorHosts,
      }
    );

    const createHandler = handlers.get(ipcChannels.sitesCreate);
    await createHandler?.(undefined, {
      name: 'newcert.localhost',
      benchId: 'bench-001',
      path: '/Users/dev/frappe-bench/sites/newcert.localhost',
      apps: ['frappe'],
    });

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);
    await updateHandler?.(undefined, 'site-001', { name: 'renamed.localhost' });

    expect(refreshFrontDoorHosts).toHaveBeenCalledTimes(2);
  });
});
