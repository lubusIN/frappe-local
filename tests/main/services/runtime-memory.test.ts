import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  ensureRuntimeRunning,
  getLastRuntimeError,
  FRAPPE_LOCAL_MACHINE_NAME,
} from '../../../src/main/services/runtime-service';

describe('Podman machine memory configuration', () => {
  beforeEach(() => {
    execPromiseMock.mockReset();
    getPodmanMachinesMock.mockReset();
    execPromiseMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    configurePodmanMemoryProvider(async () => 4096);
  });

  it('uses configured memory when initializing the Frappe Local machine', async () => {
    configurePodmanMemoryProvider(async () => 8192);
    getPodmanMachinesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ Name: FRAPPE_LOCAL_MACHINE_NAME, State: 'running' }]);

    await expect(ensureRuntimeRunning()).resolves.toBe(true);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['machine', 'init', '--now', '--cpus', '4', '--memory', '8192', FRAPPE_LOCAL_MACHINE_NAME],
      undefined,
      expect.any(Function),
      undefined,
      {
        idleTimeout: 300000,
        maxTimeout: 1800000,
      }
    );
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
    expect(commands).toContainEqual(['machine', 'stop', FRAPPE_LOCAL_MACHINE_NAME]);
    expect(commands).toContainEqual([
      'machine',
      'set',
      '--memory',
      '6144',
      FRAPPE_LOCAL_MACHINE_NAME,
    ]);
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
});
