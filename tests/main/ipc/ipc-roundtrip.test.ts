import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { AppCatalogRepository } from '../../../src/main/storage/repositories/app-catalog-repository';
import type { AppCatalogItem, Bench, Settings, Site } from '../../../src/shared/domain/models';

function makeStubCatalogRepo(items: AppCatalogItem[] = []): AppCatalogRepository {
  return {
    findAll: async () => items,
    findById: async (id: string) => items.find((i) => i.id === id) ?? null,
    search: async (query: string) => items.filter((i) => i.name.includes(query)),
  } as AppCatalogRepository;
}

function makeStubBenchRepo() {
  let current: Bench = {
    id: 'bench-stub',
    name: 'bench',
    path: '/tmp/bench',
    frappeVersion: '15.0.0',
    status: 'stopped' as const,
    apps: ['frappe'],
    timestamps: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    findAll: async () => [current],
    findById: async (id: string) => (current.id === id ? current : null),
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
    update: async (_id: string, input: {
      name?: string;
      path?: string;
      frappeVersion?: string;
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      apps?: string[];
    }) => {
      current = {
        ...current,
        ...input,
        timestamps: { ...current.timestamps, updatedAt: new Date().toISOString() },
      };
      return current;
    },
    delete: async () => true,
  };
}

function makeStubSiteRepo() {
  let current: Site = {
    id: 'site-stub',
    name: 'site.localhost',
    benchId: 'bench-stub',
    apps: ['frappe'],
    status: 'ready' as const,
    path: '/tmp/site',
    timestamps: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    findAll: async () => [current],
    findById: async (id: string) => (current.id === id ? current : null),
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
    update: async (_id: string, input: {
      name?: string;
      benchId?: string;
      apps?: string[];
      status?: 'queued' | 'ready' | 'failure';
      path?: string;
    }) => {
      current = {
        ...current,
        ...input,
        timestamps: { ...current.timestamps, updatedAt: new Date().toISOString() },
      };
      return current;
    },
    delete: async () => true,
  };
}

function makeStubSettingsRepo() {
  let current: Settings | null = null;
  return {
    get: async () => current,
    set: async (input: Partial<Settings>) => {
      current = input as Settings;
      return current;
    },
  };
}

function makeStubCustomAppsRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    create: async () => ({} as any),
    update: async () => null,
    delete: async () => false,
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
        customApps: makeStubCustomAppsRepo(),
      }
    );

    const appHealthHandler = handlers.get(ipcChannels.appHealthCheck);
    expect(appHealthHandler).toBeTypeOf('function');

    const response = await appHealthHandler?.();
    expect(response).toMatchObject({
      appName: 'Frappe Local',
      platform: process.platform,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
    });
  });
});
