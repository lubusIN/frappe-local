import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { TaskProgressEvent } from '../src/shared/domain/task-runner';

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

function makeStubSettingsRepo() {
  return {
    get: async () => null,
    set: async (input: unknown) => input,
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

function makeStubTerminalService() {
  return {
    onOutput: () => () => undefined,
    onError: () => () => undefined,
    onStateChange: () => () => undefined,
    createSession: () => ({ success: false, error: 'unused' }),
    getSession: () => null,
    write: () => false,
    closeSession: () => false,
    clear: () => false,
    resize: () => false,
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
        groups: makeStubGroupRepo(),
      },
      undefined,
      makeStubTerminalService(),
      taskRunner.runner
    );

    expect(await handlers.get(ipcChannels.taskRunnerSubscribe)?.()).toBe(true);
    expect(await handlers.get(ipcChannels.taskRunnerUnsubscribe)?.()).toBe(false);
    expect(await handlers.get(ipcChannels.taskRunnerUnsubscribe)?.()).toBe(false);
  });
});