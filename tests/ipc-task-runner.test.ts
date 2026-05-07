import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { TaskProgressEvent } from '../src/shared/domain/task-runner';
import type { Settings } from '../src/shared/domain/models';

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

function makeStubSettingsRepo() {
  return {
    get: async () => null,
    set: async (input: Partial<Settings>) => input as Settings,
  };
}

function makeStubTaskRunner() {
  let listener: ((event: TaskProgressEvent) => void) | null = null;

  return {
    runner: {
      onEvent: (nextListener: (event: TaskProgressEvent) => void) => {
        listener = nextListener;
        return () => {
          listener = null;
        };
      },
      enqueue: () => 'task-stub',
    },
    emit: (event: TaskProgressEvent) => {
      listener?.(event);
    },
  };
}

describe('task runner IPC handlers', () => {
  it('registers subscribe and unsubscribe handlers with stable state semantics', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const taskRunner = makeStubTaskRunner();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      },
      undefined,
      taskRunner.runner
    );

    expect(await handlers.get(ipcChannels.taskRunnerSubscribe)?.()).toBe(true);
    expect(await handlers.get(ipcChannels.taskRunnerUnsubscribe)?.()).toBe(true);
    expect(await handlers.get(ipcChannels.taskRunnerUnsubscribe)?.()).toBe(true);
  });
});
