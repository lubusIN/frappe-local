import { describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Bench, Settings, Site } from '../src/shared/domain/models';

const bench: Bench = {
  id: 'bench-001',
  name: 'frappe-bench',
  path: '/Users/dev/frappe-bench',
  frappeVersion: '15.0.0',
  runtime: 'podman',
  status: 'running',
  apps: ['frappe'],
  timestamps: {
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
  },
};

const site: Site = {
  id: 'site-001',
  name: 'demo.localhost',
  benchId: 'bench-001',
  groupId: null,
  apps: ['frappe'],
  status: 'running',
  path: '/Users/dev/frappe-bench/sites/demo.localhost',
  timestamps: {
    createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
  },
};

const settings: Settings = {
  defaultFrappeVersion: '15.0.0',
  storagePath: '/Users/dev/.frappe-cafe',
  terminalPreference: 'zsh',
  editorPreference: 'code -n',
  updateChannel: 'stable',
  autoUpdateEnabled: true,
  sidebarCompact: false,
};

function makeStubCatalogRepo(items: AppCatalogItem[] = []) {
  return {
    findAll: async () => items,
    findById: async (id: string) => items.find((item) => item.id === id) ?? null,
    search: async (query: string) => items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
  };
}

function makeStubBenchRepo() {
  return {
    findAll: async () => [bench],
    findById: async (id: string) => (id === bench.id ? bench : null),
    create: async () => bench,
    update: async () => bench,
    delete: async () => false,
  };
}

function makeStubSiteRepo() {
  return {
    findAll: async () => [site],
    findById: async (id: string) => (id === site.id ? site : null),
    create: async () => site,
    update: async () => site,
    delete: async () => false,
  };
}

function makeStubSettingsRepo(initial: Settings | null = settings) {
  return {
    get: async () => initial,
    set: async (input: Settings) => input,
  };
}

function makeStubGroupRepo() {
  return {
    findAll: async () => [],
    create: async () => ({ id: 'group-001', name: 'group', description: '', tags: [], siteIds: [] }),
    update: async () => null,
    delete: async () => false,
  };
}

describe('console integration IPC handlers', () => {
  it('opens the selected terminal context folder', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const openPath = vi.fn(async () => true);

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      {
        openPath,
        openInEditor: async () => false,
        pathExists: () => true,
      }
    );

    const result = await handlers.get(ipcChannels.terminalOpenFolder)?.(undefined, 'bench-001', 'site-001');

    expect(result).toBe(true);
    expect(openPath).toHaveBeenCalledWith('/Users/dev/frappe-bench/sites/demo.localhost');
  });

  it('opens the selected terminal context in the configured editor', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const openInEditor = vi.fn(async () => true);

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      {
        openPath: async () => false,
        openInEditor,
        pathExists: () => true,
      }
    );

    const result = await handlers.get(ipcChannels.terminalOpenEditor)?.(undefined, 'bench-001', null);

    expect(result).toBe(true);
    expect(openInEditor).toHaveBeenCalledWith('/Users/dev/frappe-bench', 'code -n');
  });

  it('opens the devcontainer configuration in the configured editor when present', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const openInEditor = vi.fn(async () => true);
    const pathExists = vi.fn((targetPath: string) =>
      String(targetPath) === '/Users/dev/frappe-bench' || String(targetPath) === '/Users/dev/frappe-bench/.devcontainer'
    );

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      {
        openPath: async () => false,
        openInEditor,
        pathExists,
      }
    );

    const result = await handlers.get(ipcChannels.terminalOpenDevcontainer)?.(undefined, 'bench-001');

    expect(result).toBe(true);
    expect(openInEditor).toHaveBeenCalledWith('/Users/dev/frappe-bench/.devcontainer', 'code -n');
  });

  it('returns false when no devcontainer configuration exists', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const pathExists = vi.fn((targetPath: string) =>
      String(targetPath) === '/Users/dev/frappe-bench'
    );

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      {
        openPath: async () => false,
        openInEditor: async () => true,
        pathExists,
      }
    );

    const result = await handlers.get(ipcChannels.terminalOpenDevcontainer)?.(undefined, 'bench-001');

    expect(result).toBe(false);
  });
});
