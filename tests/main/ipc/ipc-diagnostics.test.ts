import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { AppCatalogItem, Settings } from '../../../src/shared/domain/models';
import { makeStubCustomAppsRepo } from './helpers';

const ensureRuntimeRunningMock = vi.fn(async () => false);
const getLastRuntimeErrorMock = vi.fn(() => 'Podman machine image download failed.');
const getRuntimeEnvMock = vi.fn(async () => ({}));
const getBinaryPathMock = vi.fn((name: string) => `/mock/${name}`);
const getPodmanMachinesMock = vi.fn<
  () => Promise<Array<{ Name?: string; State?: string }>>
>(async () => []);
const isPodmanMachineRequiredMock = vi.fn(() => true);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const execPromiseMock = vi.fn(async (...args: unknown[]) => ({ code: 0, stdout: '', stderr: '' }));

vi.mock('../../../src/main/services/runtime-service', () => ({
  ensureRuntimeRunning: () => ensureRuntimeRunningMock(),
  getLastRuntimeError: () => getLastRuntimeErrorMock(),
  getRuntimeEnv: () => getRuntimeEnvMock(),
  FRAPPE_LOCAL_MACHINE_NAME: 'frappe-local',
}));

vi.mock('../../../src/main/utils/binaries', () => ({
  getBinaryPath: (name: string) => getBinaryPathMock(name),
}));

vi.mock('../../../src/main/utils/podman/podman', () => ({
  getPodmanMachines: () => getPodmanMachinesMock(),
  isPodmanMachineRequired: () => isPodmanMachineRequiredMock(),
}));

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

import { DEFAULT_SETTINGS } from '../../../src/shared/domain/models';

const seedSettings: Settings = {
  ...DEFAULT_SETTINGS,
  storagePath: '/Users/dev/.frappe-local',
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
    getLastRuntimeErrorMock.mockReturnValue('Podman machine image download failed.');
    getRuntimeEnvMock.mockResolvedValue({});
    getBinaryPathMock.mockImplementation((name: string) => {
      if (name === 'apps.json') return path.resolve(__dirname, '../../../bin/apps.json');
      return `/mock/${name}`;
    });
    getPodmanMachinesMock.mockResolvedValue([]);
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
        customApps: makeStubCustomAppsRepo(),
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

  it('surfaces the concrete runtime failure when fix cannot start Podman', async () => {
    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();

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

    await expect(
      handlers.get(ipcChannels.runtimeFix)?.(undefined, 'runtime-health')
    ).rejects.toThrow('Podman machine image download failed.');
  });

  it('resets development state and recreates fresh storage snapshot', async () => {
    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const refreshFrontDoorHosts = vi.fn(async () => undefined);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-reset-test-'));
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
        customApps: makeStubCustomAppsRepo(),
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

  it('removes dormant bench folders from managed storage locations', async () => {
    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-reset-dormant-test-'));
    const storagePath = path.join(tempRoot, 'storage');
    const configPath = path.join(tempRoot, 'config');
    const customStoragePath = path.join(tempRoot, 'custom-storage');
    const defaultBenchesPath = path.join(tempRoot, 'benches');
    const customBenchesPath = path.join(customStoragePath, 'benches');

    fs.mkdirSync(path.join(defaultBenchesPath, 'orphan-default'), { recursive: true });
    fs.mkdirSync(path.join(customBenchesPath, 'orphan-custom'), { recursive: true });

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo({
          ...seedSettings,
          storagePath: customStoragePath,
        }),
        customApps: makeStubCustomAppsRepo(),
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
    expect(fs.existsSync(defaultBenchesPath)).toBe(false);
    expect(fs.existsSync(customBenchesPath)).toBe(false);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reset performs compose and podman teardown for frappe-local resources on native Linux', async () => {
    isPodmanMachineRequiredMock.mockReturnValue(false);
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
      if (joined.includes('ps -a') && joined.includes('name=frappe-local-')) {
        return { code: 0, stdout: 'container-1\n', stderr: '' };
      }
      if (joined.includes('volume ls') && joined.includes('name=frappe-local-')) {
        return { code: 0, stdout: 'volume-1\n', stderr: '' };
      }
      if (joined.includes('network ls') && joined.includes('name=frappe-local-')) {
        return { code: 0, stdout: 'network-1\n', stderr: '' };
      }

      return { code: 0, stdout: '', stderr: '' };
    });

    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-reset-cleanup-test-'));
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
        customApps: makeStubCustomAppsRepo(),
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
      ['-p', 'frappe-local-1adb2eed', 'down', '-v', '--remove-orphans'],
      '/Users/dev/frappe-bench-2',
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['ps', '-a', '--filter', 'name=frappe-local-', '--format', '{{.ID}}'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['rm', '-f', 'container-1'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['volume', 'rm', '-f', 'volume-1'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['network', 'rm', 'network-1'],
      undefined,
      undefined,
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reset destroys dedicated Podman VM on Mac/Windows without container teardown', async () => {
    isPodmanMachineRequiredMock.mockReturnValue(true);
    ensureRuntimeRunningMock.mockClear();
    getPodmanMachinesMock.mockResolvedValue([{ Name: 'frappe-local', State: 'running' }]);

    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-reset-vm-clean-test-'));
    const storagePath = path.join(tempRoot, 'storage');
    const configPath = path.join(tempRoot, 'config');
    fs.mkdirSync(storagePath, { recursive: true });

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
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
    expect(ensureRuntimeRunningMock).not.toHaveBeenCalled();
    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['machine', 'rm', '--force', 'frappe-local']
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reports a Podman machine removal failure after resetting local data', async () => {
    getPodmanMachinesMock.mockResolvedValue([{ Name: 'frappe-local', State: 'stopped' }]);
    execPromiseMock.mockImplementation(async (...allArgs: unknown[]) => {
      const args = (allArgs[1] as string[]) ?? [];
      if (args.join(' ') === 'machine rm --force frappe-local') {
        return { code: 125, stdout: '', stderr: 'machine is locked' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-reset-vm-test-'));
    const storagePath = path.join(tempRoot, 'storage');
    const configPath = path.join(tempRoot, 'config');
    fs.mkdirSync(storagePath, { recursive: true });

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
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

    await expect(
      handlers.get(ipcChannels.diagnosticsResetDevState)?.()
    ).rejects.toThrow("Failed to destroy Podman machine 'frappe-local': machine is locked");
    expect(fs.existsSync(path.join(storagePath, 'storage.json'))).toBe(true);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('skips runtime init and container teardown when Podman machine does not exist or is stopped', async () => {
    ensureRuntimeRunningMock.mockClear();
    getPodmanMachinesMock.mockResolvedValue([]);

    const handlers = new Map<string, (..._args: unknown[]) => Promise<unknown> | unknown>();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-reset-skip-test-'));
    const storagePath = path.join(tempRoot, 'storage');
    const configPath = path.join(tempRoot, 'config');
    fs.mkdirSync(storagePath, { recursive: true });

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: makeStubCatalogRepo(),
        benches: makeStubBenchRepo(),
        sites: makeStubSiteRepo(),
        settings: makeStubSettingsRepo(),
        customApps: makeStubCustomAppsRepo(),
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

    const result = await handlers.get(ipcChannels.diagnosticsResetDevState)?.();
    expect(result).toBe(true);
    expect(ensureRuntimeRunningMock).not.toHaveBeenCalled();

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
