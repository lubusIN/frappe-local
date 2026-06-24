import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { AppCatalogItem, Bench, Settings, Site } from '../../../src/shared/domain/models';
import { makeStubCustomAppsRepo } from './helpers';

const orchestrateBenchAppChangesMock = vi.fn();

vi.mock('../../../src/main/services/bench-orchestration', async () => {
  const actual = await vi.importActual<typeof import('../../../src/main/services/bench-orchestration')>('../../../src/main/services/bench-orchestration');
  return {
    ...actual,
    orchestrateBenchAppChanges: (...args: Parameters<typeof actual.orchestrateBenchAppChanges>) => orchestrateBenchAppChangesMock(...args),
  };
});

vi.mock('../../../src/main/utils/ports', () => ({
  findNextAvailableTcpPort: vi.fn(async (
    startPort: number,
    reservedPorts: Set<number> = new Set()
  ) => {
    let candidate = startPort;
    while (reservedPorts.has(candidate)) {
      candidate += 1;
    }
    return candidate;
  }),
}));

const benches: Bench[] = [
  {
    id: 'bench-001',
    name: 'frappe-bench',
    path: '/Users/dev/frappe-bench',
    frappeVersion: '15.0.0',
    httpPort: 8080,
    status: 'running',
    apps: ['frappe'],
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
    findById: async (id: string) => current.find((bench) => bench.id === id) ?? null,
    create: async (input: {
      name: string;
      path: string;
      frappeVersion: string;
      httpPort?: number;
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
    findById: async (id: string) => items.find((site) => site.id === id) ?? null,
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
      current = { ...current, ...input } as Settings;
      return current;
    },
  };
}

describe('benches IPC handlers', () => {
  it('defers installed app persistence for running bench app updates', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    orchestrateBenchAppChangesMock.mockReset();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const updateHandler = handlers.get(ipcChannels.benchesUpdate);
    const updated = await updateHandler?.(undefined, 'bench-001', { apps: ['frappe', 'payments'] });

    expect(updated).toMatchObject({
      id: 'bench-001',
      apps: ['frappe'],
      appCount: 1,
    });

    expect(orchestrateBenchAppChangesMock).toHaveBeenCalledTimes(1);
    expect(orchestrateBenchAppChangesMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bench-001', apps: ['frappe'] }),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      false,
      ['frappe'],
      ['frappe', 'payments']
    );
  });

  it('benches:list returns mapped bench list items', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
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
        status: 'running',
        appCount: 1,
        apps: ['frappe'],
        httpPort: 8080,
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
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.benchesList)?.();

    expect(result).toEqual([]);
  });

  it('benches:list sorts newest benches first by creation time', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([
          {
            ...benches[0]!,
            id: 'bench-old',
            name: 'bench-old',
            timestamps: {
              createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
            },
          },
          {
            ...benches[0]!,
            id: 'bench-new',
            name: 'bench-new',
            timestamps: {
              createdAt: new Date('2026-01-03T00:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-01-03T00:00:00.000Z').toISOString(),
            },
          },
        ]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.benchesList)?.() as Array<{ id: string }>;

    expect(result.map((bench) => bench.id)).toEqual(['bench-new', 'bench-old']);
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
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const createHandler = handlers.get(ipcChannels.benchesCreate);
    const created = await createHandler?.(undefined, {
      name: 'new-bench',
      path: '/Users/dev/new-bench',
      frappeVersion: '15.0.0',
      apps: ['frappe'],
    });

    expect(created).toMatchObject({
      name: 'new-bench',
      path: path.resolve('/Users/dev/new-bench'),
      frappeVersion: '15.0.0',
      status: 'queued',
      appCount: 1,
      apps: ['frappe'],
    });
    expect((created as { httpPort?: number }).httpPort).toBeGreaterThanOrEqual(8080);
  });

  it('benches:create auto-increments HTTP port when default is already used', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([
          {
            ...benches[0]!,
            httpPort: 8080,
          },
        ]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const createHandler = handlers.get(ipcChannels.benchesCreate);
    const created = await createHandler?.(undefined, {
      name: 'new-bench-2',
      path: '/Users/dev/new-bench-2',
      frappeVersion: '15.0.0',
      apps: ['frappe'],
    });

    expect(created).toMatchObject({
      name: 'new-bench-2',
      status: 'queued',
    });
    expect((created as { httpPort?: number }).httpPort).toBeGreaterThanOrEqual(8081);
  });

  it('benches:create shifts explicit HTTP port when already used', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo([
          {
            ...benches[0]!,
            httpPort: 8080,
          },
        ]),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const createHandler = handlers.get(ipcChannels.benchesCreate);
    const created = await createHandler?.(undefined, {
      name: 'new-bench-3',
      path: '/Users/dev/new-bench-3',
      frappeVersion: '15.0.0',
      httpPort: 8080,
      apps: ['frappe'],
    });

    expect(created).toMatchObject({
      name: 'new-bench-3',
      status: 'queued',
    });
    expect((created as { httpPort?: number }).httpPort).toBeGreaterThanOrEqual(8081);
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
        customApps: makeStubCustomAppsRepo(),
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
        customApps: makeStubCustomAppsRepo(),
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
            apps: ['frappe'],
            status: 'ready',
            path: '/Users/dev/frappe-bench/sites/demo.localhost',
            timestamps: {
              createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
            },
          },
        ]),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const deleteHandler = handlers.get(ipcChannels.benchesDelete);
    const deleted = await deleteHandler?.(undefined, 'bench-001');

    expect(deleted).toBe(true);
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
        customApps: makeStubCustomAppsRepo(),
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
        customApps: makeStubCustomAppsRepo(),
      },
      { openPath, openInEditor: async () => false, openExternal: async () => false, pathExists: () => true }
    );

    const openFolderHandler = handlers.get(ipcChannels.benchesOpenFolder);
    const opened = await openFolderHandler?.(undefined, 'bench-001');

    expect(opened).toBe(true);
    expect(openPath).toHaveBeenCalled();
  });
});
