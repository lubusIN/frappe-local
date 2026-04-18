import { describe, expect, it } from 'vitest';
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
  };
}

function makeStubSiteRepo() {
  return {
    findAll: async () => [],
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
      }
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
      }
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
      }
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
      }
    );

    const saveHandler = handlers.get(ipcChannels.settingsSet);

    await expect(
      saveHandler?.(undefined, { ...seedSettings, updateChannel: 'nightly' })
    ).rejects.toThrow();
  });
});
