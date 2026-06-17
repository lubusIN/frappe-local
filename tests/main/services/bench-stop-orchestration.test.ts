import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bench } from '../../../src/shared/domain/models';
import type { TaskExecutionContext } from '../../../src/main/services/task-runner';
import { orchestrateBenchStop } from '../../../src/main/services/bench-orchestration';

const execPromiseMock = vi.fn();
const getBinaryPathMock = vi.fn();
const getRuntimeEnvMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

vi.mock('../../../src/main/utils/binaries', () => ({
  getBinaryPath: (...args: unknown[]) => getBinaryPathMock(...args),
}));

vi.mock('../../../src/main/services/runtime-service', () => ({
  ensureRuntimeRunning: vi.fn(async () => true),
  getLastRuntimeError: () => null,
  getRuntimeEnv: () => getRuntimeEnvMock(),
}));

vi.mock('../../../src/main/services/task-runner', () => ({
  getTaskRunner: () => ({
    enqueue: (...args: unknown[]) => enqueueMock(...args),
  }),
}));

describe('bench stop orchestration', () => {
  const bench: Bench = {
    id: '1adb2eedabcdef',
    name: 'demos',
    path: '/Users/dev/frappe-bench-2',
    frappeVersion: '15.0.0',
    apps: ['frappe'],
    status: 'running',
    httpPort: 8081,
    timestamps: {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  };

  const updateMock = vi.fn(async () => bench);

  let queuedRun: ((context: TaskExecutionContext) => Promise<void>) | null = null;

  const context: TaskExecutionContext = {
    taskId: 'task-bench-stop',
    signal: new AbortController().signal,
    startStep: vi.fn(),
    completeStep: vi.fn(),
    log: vi.fn(),
    throwIfCancelled: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queuedRun = null;

    getBinaryPathMock.mockReturnValue('/mock/docker-compose');
    getRuntimeEnvMock.mockResolvedValue({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    execPromiseMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    enqueueMock.mockImplementation((definition: { run: (ctx: TaskExecutionContext) => Promise<void> }) => {
      queuedRun = definition.run;
      return 'task-001';
    });
  });

  it('uses bench stop timeout configuration', async () => {
    orchestrateBenchStop(bench, {
      update: updateMock,
    });

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(1);

    const [command, args, cwd, , env, timeout] = execPromiseMock.mock.calls[0] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      { idleTimeout: number; maxTimeout?: number },
    ];

    expect(command).toBe('/mock/docker-compose');
    expect(args).toEqual(['-p', 'frappe-local-1adb2eed', 'stop', '--timeout', '20']);
    expect(cwd).toBe('/Users/dev/frappe-bench-2');
    expect(env).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(timeout).toMatchObject({ idleTimeout: expect.any(Number) });
  });

  it('falls back to down when stop command times out', async () => {
    execPromiseMock
      .mockRejectedValueOnce(new Error('Command timed out after 180000ms: /mock/docker-compose ...'))
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 });

    orchestrateBenchStop(bench, {
      update: updateMock,
    });

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(2);

    const [, firstArgs] = execPromiseMock.mock.calls[0] as [string, string[]];
    const [, secondArgs] = execPromiseMock.mock.calls[1] as [string, string[]];

    expect(firstArgs).toEqual(['-p', 'frappe-local-1adb2eed', 'stop', '--timeout', '20']);
    expect(secondArgs).toEqual(['-p', 'frappe-local-1adb2eed', 'down', '--remove-orphans', '--timeout', '20']);
  });

  it('treats already-stopped outputs as success', async () => {
    execPromiseMock.mockResolvedValueOnce({
      stdout: '',
      stderr: 'No containers to stop',
      code: 1,
    });

    orchestrateBenchStop(bench, {
      update: updateMock,
    });

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(updateMock).toHaveBeenCalledWith(bench.id, { status: 'stopped' });
    expect(context.log).toHaveBeenCalledWith('warning', expect.stringContaining('already stopped'), 'stop');
  });

  it('restores the previous running status when stopping fails', async () => {
    execPromiseMock.mockRejectedValueOnce(new Error('stop failed'));

    orchestrateBenchStop(bench, {
      update: updateMock,
    });

    expect(queuedRun).not.toBeNull();
    await expect(queuedRun?.(context)).rejects.toThrow('stop failed');
    expect(updateMock).toHaveBeenLastCalledWith(bench.id, { status: 'running' });
  });
});
