import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bench } from '../../../src/shared/domain/models';
import type { TaskExecutionContext } from '../../../src/main/services/task-runner';
import { orchestrateBenchDeletion } from '../../../src/main/services/bench-orchestration';

const execPromiseMock = vi.fn();
const getBinaryPathMock = vi.fn();
const ensureRuntimeRunningMock = vi.fn();
const getRuntimeEnvMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

vi.mock('../../../src/main/utils/binaries', () => ({
  getBinaryPath: (...args: unknown[]) => getBinaryPathMock(...args),
}));

vi.mock('../../../src/main/services/runtime-service', () => ({
  ensureRuntimeRunning: () => ensureRuntimeRunningMock(),
  getLastRuntimeError: () => null,
  getRuntimeEnv: () => getRuntimeEnvMock(),
}));

vi.mock('../../../src/main/services/task-runner', () => ({
  getTaskRunner: () => ({
    enqueue: (...args: unknown[]) => enqueueMock(...args),
  }),
}));

describe('bench delete orchestration cleanup', () => {
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
    taskId: 'task-bench-delete',
    signal: new AbortController().signal,
    startStep: vi.fn(),
    completeStep: vi.fn(),
    log: vi.fn(),
    throwIfCancelled: vi.fn(),
  };

  const benchesRepo = {
    update: vi.fn(async () => bench),
    delete: vi.fn(async () => true),
  };

  const sitesRepo = {
    findAll: vi.fn(async () => [
      {
        id: 'site-1',
        name: 'demo.localhost',
        benchId: bench.id,
        path: '/Users/dev/frappe-bench-2/sites/demo.localhost',
        apps: ['frappe'],
        status: 'ready' as const,
        timestamps: {
          createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        },
      },
      {
        id: 'site-2',
        name: 'erp.localhost',
        benchId: bench.id,
        path: '/Users/dev/frappe-bench-2/sites/erp.localhost',
        apps: ['frappe'],
        status: 'ready' as const,
        timestamps: {
          createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        },
      },
      {
        id: 'site-3',
        name: 'other-bench.localhost',
        benchId: 'another-bench',
        path: '/Users/dev/other-bench/sites/other-bench.localhost',
        apps: ['frappe'],
        status: 'ready' as const,
        timestamps: {
          createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        },
      },
    ]),
    delete: vi.fn(async () => true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queuedRun = null;

    getBinaryPathMock.mockImplementation((name: string) => {
      if (name === 'docker-compose') return '/mock/docker-compose';
      if (name === 'podman') return '/mock/podman';
      return `/mock/${name}`;
    });

    ensureRuntimeRunningMock.mockResolvedValue(true);
    getRuntimeEnvMock.mockResolvedValue({ DOCKER_HOST: 'unix:///tmp/mock.sock' });

    execPromiseMock
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: 'container-1\n', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: 'volume-1\n', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: 'network-1\n', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

    enqueueMock.mockImplementation((definition: { run: (ctx: TaskExecutionContext) => Promise<void> }) => {
      queuedRun = definition.run;
      return 'task-001';
    });
  });

  it('tears down compose project resources for the deleted bench', async () => {
    orchestrateBenchDeletion(bench, benchesRepo, sitesRepo);

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      ['-p', 'frappe-local-1adb2eed', 'down', '-v', '--remove-orphans'],
      '/Users/dev/frappe-bench-2',
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      ['ps', '-a', '--filter', 'label=com.docker.compose.project=frappe-local-1adb2eed', '--format', '{{.ID}}'],
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

  });
});
