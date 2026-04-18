import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { Settings } from '../src/shared/domain/models';

const seedSettings: Settings = {
  defaultFrappeVersion: '15.0.0',
  runtimePreference: 'docker',
  storagePath: '/Users/dev/.frappe-cafe',
  terminalPreference: 'zsh',
  editorPreference: 'code',
  updateChannel: 'stable',
  autoUpdateEnabled: true,
};

function makeStubCatalogRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    search: async () => [],
  };
}

function makeStubBenchRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    create: async () => ({
      id: 'bench-stub',
      name: 'bench',
      path: '/tmp/bench',
      frappeVersion: '15.0.0',
      runtime: 'docker' as const,
      status: 'stopped' as const,
      apps: [],
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
    create: async () => ({
      id: 'site-stub',
      name: 'site.local',
      benchId: 'bench-stub',
      groupId: null,
      apps: [],
      status: 'stopped' as const,
      path: '/tmp/site',
      timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
    update: async () => null,
    delete: async () => false,
  };
}

function makeStubSettingsRepo(initial: Settings | null = seedSettings) {
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
    create: async () => ({ id: 'group-stub', name: 'workspace', description: '', tags: [], siteIds: [] }),
    update: async () => null,
    delete: async () => false,
  };
}

describe('runtime IPC handlers', () => {
  it('returns runtime health using the configured runtime preference', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const runtimeService = {
      getHealth: async () => ({
        preferredRuntime: 'docker' as const,
        selectedRuntime: 'docker' as const,
        fallbackRuntime: null,
        fallbackApplied: false,
        dependencies: [],
        blockingDependencies: [],
        hasBlockingIssues: false,
      }),
      startRepair: async () => ({
        taskId: 'task-runtime-repair',
        preferredRuntime: 'docker' as const,
        selectedRuntime: 'docker' as const,
        fallbackApplied: false,
        dryRun: true,
        repairDependencies: [],
      }),
    };

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      undefined,
      undefined,
      undefined,
      runtimeService
    );

    const response = await handlers.get(ipcChannels.runtimeGetHealth)?.();
    expect(response).toMatchObject({
      preferredRuntime: 'docker',
      selectedRuntime: 'docker',
    });
  });

  it('starts a runtime repair task and rejects invalid payloads', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const runtimeService = {
      getHealth: async () => ({
        preferredRuntime: 'docker' as const,
        selectedRuntime: 'docker' as const,
        fallbackRuntime: null,
        fallbackApplied: false,
        dependencies: [],
        blockingDependencies: [],
        hasBlockingIssues: false,
      }),
      startRepair: async (input: { runtimePreference?: 'docker' | 'podman'; dryRun?: boolean }) => ({
        taskId: 'task-runtime-repair',
        preferredRuntime: input.runtimePreference ?? 'docker',
        selectedRuntime: input.runtimePreference ?? 'docker',
        fallbackApplied: false,
        dryRun: input.dryRun ?? true,
        repairDependencies: [],
      }),
    };

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        groups: makeStubGroupRepo(),
      },
      undefined,
      undefined,
      undefined,
      runtimeService
    );

    const repair = await handlers.get(ipcChannels.runtimeRepair)?.(undefined, { dryRun: true });
    expect(repair).toMatchObject({
      preferredRuntime: 'docker',
      dryRun: true,
    });

    await expect(
      handlers.get(ipcChannels.runtimeRepair)?.(undefined, { runtimePreference: 'compose' })
    ).rejects.toThrow('Unsupported runtime preference.');
  });
});