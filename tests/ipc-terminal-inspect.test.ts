import { describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Settings } from '../src/shared/domain/models';

function makeStubCatalogRepo(items: AppCatalogItem[] = []) {
  return {
    findAll: async () => items,
    findById: async (id: string) => items.find((item) => item.id === id) ?? null,
    search: async (query: string) => items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
  };
}

function makeStubBenchRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    create: async () => {
      throw new Error('not implemented');
    },
    update: async () => null,
    delete: async () => false,
  };
}

function makeStubSiteRepo() {
  return {
    findAll: async () => [],
    findById: async () => null,
    create: async () => {
      throw new Error('not implemented');
    },
    update: async () => null,
    delete: async () => false,
  };
}

function makeStubSettingsRepo(initial: Settings | null = null) {
  return {
    get: async () => initial,
    set: async (input: Settings) => input,
  };
}

function makeStubGroupRepo() {
  return {
    findAll: async () => [],
    create: async () => ({ id: 'group-1', name: 'group', description: '', tags: [], siteIds: [] }),
    update: async () => null,
    delete: async () => false,
  };
}

describe('terminal inspect IPC handler', () => {
  it('returns session inspection details when the session exists', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const terminalService = {
      onOutput: vi.fn(() => () => undefined),
      onError: vi.fn(() => () => undefined),
      onStateChange: vi.fn(() => () => undefined),
      createSession: vi.fn(),
      getSession: vi.fn(() => ({
        id: 'terminal-1',
        state: 'ready',
        workingDirectory: '/Users/example/bench-1',
        contextBenchId: 'bench-1',
        contextSiteId: null,
        createdAt: '2026-04-19T00:00:00.000Z',
        lastActivityAt: '2026-04-19T00:01:00.000Z',
      })),
      write: vi.fn(),
      closeSession: vi.fn(),
      clear: vi.fn(),
      resize: vi.fn(),
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
      {
        openPath: async () => false,
        openInEditor: async () => false,
        pathExists: () => false,
      },
      terminalService
    );

    const result = await handlers.get(ipcChannels.terminalInspect)?.(undefined, 'terminal-1');

    expect(result).toEqual({
      sessionId: 'terminal-1',
      state: 'ready',
      workingDirectory: '/Users/example/bench-1',
      contextBenchId: 'bench-1',
      contextSiteId: null,
      createdAt: '2026-04-19T00:00:00.000Z',
      lastActivityAt: '2026-04-19T00:01:00.000Z',
    });
  });

  it('returns null for unknown sessions', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    const terminalService = {
      onOutput: vi.fn(() => () => undefined),
      onError: vi.fn(() => () => undefined),
      onStateChange: vi.fn(() => () => undefined),
      createSession: vi.fn(),
      getSession: vi.fn(() => null),
      write: vi.fn(),
      closeSession: vi.fn(),
      clear: vi.fn(),
      resize: vi.fn(),
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
      {
        openPath: async () => false,
        openInEditor: async () => false,
        pathExists: () => false,
      },
      terminalService
    );

    const result = await handlers.get(ipcChannels.terminalInspect)?.(undefined, 'missing');
    expect(result).toBeNull();
  });
});