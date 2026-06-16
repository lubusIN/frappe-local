import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { TaskProgressEvent } from '../../../src/shared/domain/task-runner';
import type { Settings } from '../../../src/shared/domain/models';

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
      configureLogDirectory: () => undefined,
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

  it('reads full task logs from the configured log directory', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const taskRunner = makeStubTaskRunner();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bench-task-log-ipc-'));
    const logsPath = path.join(tempDir, 'logs');
    const tasksPath = path.join(logsPath, 'tasks');
    fs.mkdirSync(tasksPath, { recursive: true });
    fs.writeFileSync(
      path.join(tasksPath, 'task-123.log'),
      '[2026-06-16T08:20:00.000Z] [INFO] first line\n[2026-06-16T08:20:01.000Z] [ERROR] second line\n',
      'utf8'
    );

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      },
      undefined,
      taskRunner.runner,
      '0.1.0',
      {
        userDataPath: tempDir,
        logsPath,
        storagePath: path.join(tempDir, 'storage.json'),
        configPath: path.join(tempDir, 'config.json'),
      }
    );

    await expect(handlers.get(ipcChannels.taskRunnerReadLog)?.({}, 'unsafe/task')).rejects.toThrow('Invalid task id.');
    await expect(handlers.get(ipcChannels.taskRunnerReadLog)?.({}, 'missing-task')).resolves.toBe('');
    await expect(handlers.get(ipcChannels.taskRunnerReadLog)?.({}, 'task-123')).resolves.toContain('first line');
  });
});
