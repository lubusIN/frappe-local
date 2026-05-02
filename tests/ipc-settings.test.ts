import { describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Settings } from '../src/shared/domain/models';

const seedSettings: Settings = {
  defaultFrappeVersion: '15.0.0',
  runtimePreference: 'docker',
  storagePath: '/Users/dev/.frappe-cafe',
  terminalPreference: 'zsh',
  editorPreference: 'code',
  updateChannel: 'stable',
  autoUpdateEnabled: true,
  sidebarCompact: false,
};

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
    findById: async () => null,
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

function makeStubSettingsRepo(initial: Settings | null = null) {
  let current = initial;
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

function makeStubTerminalService() {
  return {
    onOutput: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
    onStateChange: vi.fn(() => () => {}),
    createSession: vi.fn(),
    getSession: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    resize: vi.fn(),
    closeSession: vi.fn(),
    listSessions: vi.fn(() => []),
  };
}

describe('settings IPC handlers', () => {
  it('settings:get returns null when settings are not configured', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(null),
        groups: makeStubGroupRepo(),
      },
      undefined,
      makeStubTerminalService() as any
    );

    const result = await handlers.get(ipcChannels.settingsGet)?.();
    expect(result).toBeNull();
  });

  it('settings:get returns persisted settings', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(seedSettings),
        groups: makeStubGroupRepo(),
      },
      undefined,
      makeStubTerminalService() as any
    );

    const result = await handlers.get(ipcChannels.settingsGet)?.();
    expect(result).toMatchObject({
      defaultFrappeVersion: '15.0.0',
      runtimePreference: 'docker',
      updateChannel: 'stable',
      autoUpdateEnabled: true,
    });
  });

  it('settings:set validates and persists settings', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(null),
        groups: makeStubGroupRepo(),
      },
      undefined,
      makeStubTerminalService() as any
    );

    const saveHandler = handlers.get(ipcChannels.settingsSet);
    const getHandler = handlers.get(ipcChannels.settingsGet);

    await saveHandler?.(undefined, seedSettings);
    const loaded = await getHandler?.();

    expect(loaded).toMatchObject(seedSettings);
  });

  it('settings:set rejects invalid settings payload', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(null),
        groups: makeStubGroupRepo(),
      },
      undefined,
      makeStubTerminalService() as any
    );

    const saveHandler = handlers.get(ipcChannels.settingsSet);

    await expect(
      saveHandler?.(undefined, { ...seedSettings, updateChannel: 'nightly' })
    ).rejects.toThrow();
  });

  it('update:get-status returns deferred update strategy', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(seedSettings),
        groups: makeStubGroupRepo(),
      },
      undefined,
      makeStubTerminalService() as any,
      undefined,
      '0.1.0'
    );

    const status = await handlers.get(ipcChannels.updateGetStatus)?.();
    expect(status).toMatchObject({
      mode: 'deferred-manual',
      channel: 'stable',
      currentVersion: '0.1.0',
    });
  });

  it('update:check-now returns not-configured result', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(seedSettings),
        groups: makeStubGroupRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.updateCheckNow)?.();
    expect(result).toMatchObject({
      source: 'manual',
      status: 'not-configured',
    });
  });
});
