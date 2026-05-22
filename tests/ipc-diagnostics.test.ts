import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';
import type { AppCatalogItem, Settings } from '../src/shared/domain/models';

const ensureRuntimeRunningMock = vi.fn(async () => false);
const getRuntimeEnvMock = vi.fn(async () => ({}));
const getBinaryPathMock = vi.fn((name: string) => `/mock/${name}`);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const execPromiseMock = vi.fn(async (...args: unknown[]) => ({ code: 0, stdout: '', stderr: '' }));

vi.mock('../src/main/runtime-service', () => ({
  ensureRuntimeRunning: () => ensureRuntimeRunningMock(),
  getRuntimeEnv: () => getRuntimeEnvMock(),
}));

vi.mock('../src/main/utils/binaries', () => ({
  getBinaryPath: (name: string) => getBinaryPathMock(name),
}));

vi.mock('../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

import { DEFAULT_SETTINGS } from '../src/shared/domain/models';

const seedSettings: Settings = {
  ...DEFAULT_SETTINGS,
  storagePath: '/Users/dev/.local-bench',
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
    set: async (input: Partial<Settings>) => {
      current = { ...(current ?? seedSettings), ...input };
      return current;
    },
  };
}

describe('diagnostics IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureRuntimeRunningMock.mockResolvedValue(false);
    getRuntimeEnvMock.mockResolvedValue({});
    getBinaryPathMock.mockImplementation((name: string) => `/mock/${name}`);
    execPromiseMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  });

  it('runs diagnostics on demand and caches the latest report', async () => {
    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      },
      undefined,
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

  it('resets development state and recreates fresh storage snapshot', async () => {
    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const refreshFrontDoorHosts = vi.fn(async () => undefined);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bench-reset-test-'));
    const storagePath = path.join(tempRoot, 'storage');
    const configPath = path.join(tempRoot, 'config');
    fs.mkdirSync(storagePath, { recursive: true });
    fs.mkdirSync(configPath, { recursive: true });

    fs.writeFileSync(path.join(storagePath, 'storage.json'), JSON.stringify({ invalid: true }), 'utf8');
    fs.writeFileSync(path.join(configPath, 'state.json'), JSON.stringify({ invalid: true }), 'utf8');

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      },
      {
        openPath: async () => false,
        openInEditor: async () => false,
        openExternal: async () => false,
        pathExists: () => false,
        refreshFrontDoorHosts,
      },
      undefined,
      '0.1.0',
      {
        userDataPath: tempRoot,
        logsPath: path.join(tempRoot, 'logs'),
        configPath,
        storagePath,
      }
    );

    const resetResult = await handlers.get(ipcChannels.diagnosticsResetDevState)?.();
    expect(resetResult).toBe(true);

    const recreated = JSON.parse(fs.readFileSync(path.join(storagePath, 'storage.json'), 'utf8')) as {
      benches: unknown[];
      sites: unknown[];
      appCatalog: unknown[];
    };
    expect(recreated.benches).toEqual([]);
    expect(recreated.sites).toEqual([]);
    expect(Array.isArray(recreated.appCatalog)).toBe(true);
    expect(recreated.appCatalog.length).toBeGreaterThan(0);
    expect(fs.existsSync(configPath)).toBe(false);
    expect(refreshFrontDoorHosts).toHaveBeenCalledTimes(1);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reset performs compose and podman teardown for local-bench resources', async () => {
    ensureRuntimeRunningMock.mockResolvedValue(true);
    getRuntimeEnvMock.mockResolvedValue({ DOCKER_HOST: 'unix:///tmp/mock.sock' });

    const bench = {
      id: '1adb2eedabcdef',
      name: 'demos',
      path: '/Users/dev/frappe-bench-2',
      frappeVersion: '15.0.0',
      status: 'running' as const,
      apps: ['frappe'],
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    execPromiseMock.mockImplementation(async (...allArgs: unknown[]) => {
      const args = (allArgs[1] as string[]) ?? [];
      const joined = args.join(' ');
      if (joined.includes('ps -a') && joined.includes('name=local-bench-')) {
        return { code: 0, stdout: 'container-1\n', stderr: '' };
      }
      if (joined.includes('volume ls') && joined.includes('name=local-bench-')) {
        return { code: 0, stdout: 'volume-1\n', stderr: '' };
      }
      if (joined.includes('network ls') && joined.includes('name=local-bench-')) {
        return { code: 0, stdout: 'network-1\n', stderr: '' };
      }

      return { code: 0, stdout: '', stderr: '' };
    });

    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bench-reset-cleanup-test-'));
    const storagePath = path.join(tempRoot, 'storage');
    const configPath = path.join(tempRoot, 'config');
    fs.mkdirSync(storagePath, { recursive: true });

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: {
          ...makeStubBenchRepo(),
          findAll: async () => [bench],
        },
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
      },
      undefined,
      undefined,
      '0.1.0',
      {
        userDataPath: tempRoot,
        logsPath: path.join(tempRoot, 'logs'),
        configPath,
        storagePath,
      }
    );

    const resetResult = await handlers.get(ipcChannels.diagnosticsResetDevState)?.();
    expect(resetResult).toBe(true);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      ['-p', 'local-bench-1adb2eed', 'down', '-v', '--remove-orphans'],
      '/Users/dev/frappe-bench-2',
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.any(Number)
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['ps', '-a', '--filter', 'name=local-bench-', '--format', '{{.ID}}'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.any(Number)
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['rm', '-f', 'container-1'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.any(Number)
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['volume', 'rm', '-f', 'volume-1'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.any(Number)
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['network', 'rm', 'network-1'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.any(Number)
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
