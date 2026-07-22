import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bench } from '../../../src/shared/domain/models';
import type { TaskExecutionContext } from '../../../src/main/services/task-runner';
import { orchestrateBenchBuild } from '../../../src/main/services/bench-orchestration';

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
  getRuntimeEnv: () => getRuntimeEnvMock(),
}));

vi.mock('../../../src/main/services/task-runner', () => ({
  getTaskRunner: () => ({
    enqueue: (...args: unknown[]) => enqueueMock(...args),
  }),
}));

describe('bench build orchestration', () => {
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

  let queuedRun: ((context: TaskExecutionContext) => Promise<void>) | null = null;

  const context: TaskExecutionContext = {
    taskId: 'task-bench-build',
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

  it('uses docker-compose to run bench build', async () => {
    orchestrateBenchBuild(bench);

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
    expect(args).toEqual(['-p', 'frappe-local-1adb2eed', 'exec', '-T', 'frappe', 'bench', 'build']);
    expect(cwd).toBe('/Users/dev/frappe-bench-2');
    expect(env).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(timeout).toMatchObject({ idleTimeout: expect.any(Number), maxTimeout: expect.any(Number) });
  });

  it('throws an error if command fails with non-zero exit code', async () => {
    execPromiseMock.mockResolvedValueOnce({
      stdout: '',
      stderr: 'Build failed',
      code: 1,
    });

    orchestrateBenchBuild(bench);

    expect(queuedRun).not.toBeNull();
    await expect(queuedRun?.(context)).rejects.toThrow('Command failed with exit code 1: Build failed');
  });

  it('throws an error if execPromise rejects', async () => {
    execPromiseMock.mockRejectedValueOnce(new Error('Network error'));

    orchestrateBenchBuild(bench);

    expect(queuedRun).not.toBeNull();
    await expect(queuedRun?.(context)).rejects.toThrow('Network error');
  });
});
