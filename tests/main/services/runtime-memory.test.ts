import { beforeEach, describe, expect, it, vi } from 'vitest';

const execPromiseMock = vi.fn();
const getPodmanMachinesMock = vi.fn();

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
  LOCAL_BENCH_MACHINE_NAME,
} from '../../../src/main/services/runtime-service';

describe('Podman machine memory configuration', () => {
  beforeEach(() => {
    execPromiseMock.mockReset();
    getPodmanMachinesMock.mockReset();
    execPromiseMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    configurePodmanMemoryProvider(async () => 4096);
  });

  it('uses configured memory when initializing the Local Bench machine', async () => {
    configurePodmanMemoryProvider(async () => 8192);
    getPodmanMachinesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ Name: LOCAL_BENCH_MACHINE_NAME, State: 'running' }]);

    await expect(ensureRuntimeRunning()).resolves.toBe(true);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['machine', 'init', '--cpus', '4', '--memory', '8192', LOCAL_BENCH_MACHINE_NAME],
      undefined,
      undefined,
      undefined,
      { idleTimeout: 60000 }
    );
  });

  it('restarts a running machine around a changed memory allocation', async () => {
    getPodmanMachinesMock.mockResolvedValue([
      { Name: LOCAL_BENCH_MACHINE_NAME, State: 'running' },
    ]);
    execPromiseMock.mockImplementation(async (_binary: string, args: string[]) => {
      if (args[0] === 'machine' && args[1] === 'inspect') {
        return { stdout: '4096\n', stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    });

    await applyPodmanMachineMemory(6144);

    const commands = execPromiseMock.mock.calls.map(([, args]) => args);
    expect(commands).toContainEqual(['machine', 'stop', LOCAL_BENCH_MACHINE_NAME]);
    expect(commands).toContainEqual([
      'machine',
      'set',
      '--memory',
      '6144',
      LOCAL_BENCH_MACHINE_NAME,
    ]);
    expect(commands).toContainEqual(['machine', 'start', LOCAL_BENCH_MACHINE_NAME]);
  });
});
