import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogRepository } from '../src/main/storage/repositories/app-catalog-repository';
import type { AppCatalogItem, Bench, Settings, Site } from '../src/shared/domain/models';

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
    runtime: 'docker' as const,
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
    update: async (_id: string, input: {
      name?: string;
      path?: string;
      frappeVersion?: string;
      runtime?: 'docker' | 'podman';
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
    groupId: null as string | null,
    apps: ['frappe'],
    status: 'stopped' as const,
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
    update: async (_id: string, input: {
      name?: string;
      benchId?: string;
      groupId?: string | null;
      apps?: string[];
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
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