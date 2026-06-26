import { describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { AppCatalogItem, Settings } from '../../../src/shared/domain/models';
import { makeStubCustomAppsRepo } from './helpers';

import { DEFAULT_SETTINGS } from '../../../src/shared/domain/models';
import { getRecommendedPodmanMemoryMb } from '../../../src/shared/core/system-resources';

const seedSettings: Settings = {
  ...DEFAULT_SETTINGS,
  storagePath: '/Users/dev/.frappe-local',
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

function makeStubSettingsRepo(initial: Settings | null = null) {
  let current = initial;
  return {
    get: async () => current,
    set: async (input: Partial<Settings>) => {
      current = { ...(current ?? seedSettings), ...input };
      return current;
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
        customApps: makeStubCustomAppsRepo(),
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
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.settingsGet)?.();
    expect(result).toMatchObject({
      defaultFrappeVersion: '16.0.0',
      updateChannel: 'nightly',
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
        customApps: makeStubCustomAppsRepo(),
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
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const saveHandler = handlers.get(ipcChannels.settingsSet);

    await expect(
      saveHandler?.(undefined, { ...seedSettings, updateChannel: 'invalid-channel' })
    ).rejects.toThrow();
  });

  it('reports host memory limits and a 75 percent recommendation', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(seedSettings),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const resources = await handlers.get(ipcChannels.systemResourcesGet)?.() as {
      totalMemoryMb: number;
      recommendedPodmanMemoryMb: number;
      podmanMachineRequired: boolean;
    };

    expect(resources.totalMemoryMb).toBeGreaterThanOrEqual(4096);
    expect(resources.recommendedPodmanMemoryMb).toBe(
      getRecommendedPodmanMemoryMb(resources.totalMemoryMb)
    );
    expect(typeof resources.podmanMachineRequired).toBe('boolean');
  });

  it('rejects Podman memory above host RAM', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(seedSettings),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    await expect(
      handlers.get(ipcChannels.settingsSet)?.(undefined, {
        ...seedSettings,
        podmanMemoryMb: Number.MAX_SAFE_INTEGER,
      })
    ).rejects.toThrow('Podman memory cannot exceed system memory');
  });

  it('applies a changed Podman memory allocation before persisting it', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const applyRuntimeMemory = vi.fn(async () => undefined);
    const settings = makeStubSettingsRepo(null);

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings,
        customApps: makeStubCustomAppsRepo(),
      },
      {
        openPath: async () => false,
        openInEditor: async () => false,
        openExternal: async () => false,
        pathExists: () => false,
        applyRuntimeMemory,
      }
    );

    await handlers.get(ipcChannels.settingsSet)?.(undefined, seedSettings);

    expect(applyRuntimeMemory).toHaveBeenCalledWith(seedSettings.podmanMemoryMb);
    expect(await settings.get()).toMatchObject(seedSettings);
  });

  it('update:check-now returns not configured in unpackaged builds', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(seedSettings),
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const result = await handlers.get(ipcChannels.updateCheckNow)?.();
    expect(result).toMatchObject({
      source: 'manual',
      status: 'not-configured',
    });
  });
});
