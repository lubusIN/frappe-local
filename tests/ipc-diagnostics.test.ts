import { describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Settings } from '../src/shared/domain/models';
import type { DiagnosticsReport } from '../src/shared/domain/diagnostics';

const seedSettings: Settings = {
  defaultFrappeVersion: '15.0.0',
  runtimePreference: 'docker',
  storagePath: '/Users/dev/.frappe-cafe',
  terminalPreference: 'zsh',
  editorPreference: 'code',
  updateChannel: 'stable',
  autoUpdateEnabled: true,
  sidebarCompact: false,
};

const initialReport: DiagnosticsReport = {
  checks: [],
  hasCriticalIssues: false,
  hasWarnings: false,
  summary: 'Initial startup diagnostics are ready.',
  completedAt: '2026-04-19T12:00:00.000Z',
  appVersion: '0.1.0',
};

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
    create: async (input: { name: string; description: string; tags: string[]; siteIds: string[] }) => ({
      id: 'group-stub',
      ...input,
    }),
    update: async () => null,
    delete: async () => false,
  };
}

function makeStubTerminalService() {
  return {
    onOutput: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
    onStateChange: vi.fn(() => () => {}),
    createSession: vi.fn(),
    getSession: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    resize: vi.fn(),
    closeSession: vi.fn(),
    listSessions: vi.fn(() => []),
  };
}

describe('diagnostics IPC handlers', () => {
  it('returns the bootstrap-seeded diagnostics report', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

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
      makeStubTerminalService() as any,
      undefined,
      '0.1.0',
      {
        userDataPath: '/tmp/userData',
        logsPath: '/tmp/logs',
        configPath: '/tmp/config',
        storagePath: '/tmp/storage',
      },
      initialReport
    );

    const result = await handlers.get(ipcChannels.diagnosticsGetLast)?.();
    expect(result).toEqual(initialReport);
  });

  it('runs diagnostics on demand and caches the latest report', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

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
      makeStubTerminalService() as any,
      undefined,
      '0.1.0',
      {
        userDataPath: '/tmp',
        logsPath: '/tmp/logs',
        configPath: '/tmp/config',
        storagePath: '/tmp/storage',
      }
    );

    const report = await handlers.get(ipcChannels.diagnosticsRun)?.();
    const cached = await handlers.get(ipcChannels.diagnosticsGetLast)?.();

    expect(report).toMatchObject({ appVersion: '0.1.0' });
    expect(cached).toEqual(report);
  });
});