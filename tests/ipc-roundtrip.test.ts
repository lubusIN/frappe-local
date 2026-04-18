import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogRepository } from '../src/main/storage/repositories/app-catalog-repository';
import type { AppCatalogItem, Settings } from '../src/shared/domain/models';

function makeStubCatalogRepo(items: AppCatalogItem[] = []): AppCatalogRepository {
  return {
    findAll: async () => items,
    findById: async (id: string) => items.find((i) => i.id === id) ?? null,
    search: async (query: string) => items.filter((i) => i.name.includes(query)),
  } as AppCatalogRepository;
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
  };
}

describe('ipc roundtrip', () => {
  it('returns app health through the registered handler', async () => {
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

    const appHealthHandler = handlers.get(ipcChannels.appHealthCheck);
    expect(appHealthHandler).toBeTypeOf('function');

    const response = await appHealthHandler?.();
    expect(response).toMatchObject({
      appName: 'Frappe Cafe',
      platform: process.platform,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    });
  });
});