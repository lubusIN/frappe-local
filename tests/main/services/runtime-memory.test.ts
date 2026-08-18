import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execPromiseMock = vi.fn();
const getPodmanMachinesMock = vi.fn();

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: {
      ...actual,
      totalmem: () => 16 * 1024 * 1024 * 1024,
    },
    totalmem: () => 16 * 1024 * 1024 * 1024,
  };
});

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

vi.mock('../../../src/main/utils/binaries', () => ({
  getBinaryPath: (name: string) => `/mock/${name}`,
}));

vi.mock('../../../src/main/utils/podman/podman', () => ({
  isPodmanMachineRequired: () => true,
  getPodmanMachines: () => getPodmanMachinesMock(),
  cleanupStaleMacPodmanProcesses: vi.fn(async () => undefined),
}));

import {
  applyPodmanMachineMemory,
  configurePodmanMemoryProvider,
  configureWslConfigPathProvider,
  ensureRuntimeRunning,
  getLastRuntimeError,
  FRAPPE_LOCAL_MACHINE_NAME,
  updateWslConfigMemory,
} from '../../../src/main/services/runtime-service';

describe('Podman machine memory configuration', () => {
  const wslConfigPath = path.join(os.tmpdir(), `frappe-local-test-${process.pid}.wslconfig`);

  beforeEach(() => {
    execPromiseMock.mockReset();
    getPodmanMachinesMock.mockReset();
    execPromiseMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    configurePodmanMemoryProvider(async () => 4096);
    configureWslConfigPathProvider(() => wslConfigPath);
    fs.rmSync(wslConfigPath, { force: true });
  });

  it('preserves unrelated WSL settings while setting the memory limit', () => {
    const existing = '[wsl2]\r\nprocessors=4\r\n\r\n[experimental]\r\nautoMemoryReclaim=gradual\r\n';

    expect(updateWslConfigMemory(existing, 6144)).toBe(
      '[wsl2]\r\nmemory=6144MB\r\nprocessors=4\r\n\r\n[experimental]\r\nautoMemoryReclaim=gradual\r\n'
    );
    expect(updateWslConfigMemory('[wsl2]\nmemory=4096MB\n', 6144)).toBe(
      '[wsl2]\nmemory=6144MB\n'
    );
  });

  it('uses configured memory when initializing the Frappe Local machine', async () => {
    configurePodmanMemoryProvider(async () => 8192);
    getPodmanMachinesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ Name: FRAPPE_LOCAL_MACHINE_NAME, State: 'running' }]);

    await expect(ensureRuntimeRunning()).resolves.toBe(true);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      process.platform === 'win32'
        ? ['machine', 'init', '--now', FRAPPE_LOCAL_MACHINE_NAME]
        : ['machine', 'init', '--now', '--cpus', '4', '--memory', '8192', FRAPPE_LOCAL_MACHINE_NAME],
      undefined,
      expect.any(Function),
      expect.anything(),
      {
        idleTimeout: 300000,
        maxTimeout: 1800000,
      }
    );

    if (process.platform === 'win32') {
      expect(fs.readFileSync(wslConfigPath, 'utf8')).toContain('memory=8192MB');
      expect(execPromiseMock).toHaveBeenCalledWith(
        'wsl.exe',
        ['--shutdown'],
        undefined,
        undefined,
        undefined,
        { idleTimeout: 60000, maxTimeout: 120000 }
      );
    }
  });

  it('restarts a running machine around a changed memory allocation', async () => {
    getPodmanMachinesMock.mockResolvedValue([
      { Name: FRAPPE_LOCAL_MACHINE_NAME, State: 'running' },
    ]);
    execPromiseMock.mockImplementation(async (_binary: string, args: string[]) => {
      if (args[0] === 'machine' && args[1] === 'inspect') {
        return { stdout: '4096\n', stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    });

    await applyPodmanMachineMemory(6144);

    const commands = execPromiseMock.mock.calls.map(([, args]) => args);
    if (process.platform === 'win32') {
      expect(fs.readFileSync(wslConfigPath, 'utf8')).toContain('memory=6144MB');
      expect(execPromiseMock).toHaveBeenCalledWith(
        'wsl.exe',
        ['--shutdown'],
        undefined,
        undefined,
        undefined,
        { idleTimeout: 60000, maxTimeout: 120000 }
      );
      expect(commands).not.toContainEqual(expect.arrayContaining(['machine', 'set', '--memory']));
    } else {
      expect(commands).toContainEqual(['machine', 'stop', FRAPPE_LOCAL_MACHINE_NAME]);
      expect(commands).toContainEqual([
        'machine',
        'set',
        '--memory',
        '6144',
        FRAPPE_LOCAL_MACHINE_NAME,
      ]);
    }
    expect(commands).toContainEqual(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME]);
  });

  it('retains stderr from non-zero Podman commands', async () => {
    execPromiseMock.mockResolvedValueOnce({
      stdout: '',
      stderr: 'helper binary vfkit was not found',
      code: 125,
    });

    await expect(ensureRuntimeRunning()).resolves.toBe(false);
    expect(getLastRuntimeError()).toContain('helper binary vfkit was not found');
  });

  it('formats DOCKER_HOST properly for Windows named pipes and unix sockets', async () => {
    const { getRuntimeEnv } = await import('../../../src/main/services/runtime-service');
    
    // Test Named Pipe format
    execPromiseMock.mockResolvedValueOnce({
      stdout: '\\\\.\\pipe\\podman-frappe-local\n',
      stderr: '',
      code: 0,
    });

    const env1 = await getRuntimeEnv();
    if (process.platform === 'win32') {
      expect(env1.DOCKER_HOST).toBe('npipe:////./pipe/podman-frappe-local');
    }

    // Test Windows drive letter file path format
    execPromiseMock.mockResolvedValueOnce({
      stdout: 'C:\\Users\\test\\AppData\\Local\\Temp\\podman\\frappe-local-api.sock\n',
      stderr: '',
      code: 0,
    });

    const env2 = await getRuntimeEnv();
    if (process.platform === 'win32') {
      expect(env2.DOCKER_HOST).toBe('unix:///C:/Users/test/AppData/Local/Temp/podman/frappe-local-api.sock');
    }
  });
});
