import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Bench } from '../src/shared/domain/models';
import type { TaskExecutionContext } from '../src/main/task-runner';
import { OPERATION_TIMEOUTS } from '../src/main/constants';
import { orchestrateBenchStart } from '../src/main/bench-orchestration';

const execPromiseMock = vi.fn();
const getBinaryPathMock = vi.fn();
const ensureRuntimeRunningMock = vi.fn();
const getRuntimeEnvMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock('../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

vi.mock('../src/main/utils/binaries', () => ({
  getBinaryPath: (...args: unknown[]) => getBinaryPathMock(...args),
}));

vi.mock('../src/main/runtime-service', () => ({
  ensureRuntimeRunning: () => ensureRuntimeRunningMock(),
  getRuntimeEnv: () => getRuntimeEnvMock(),
}));

vi.mock('../src/main/task-runner', () => ({
  getTaskRunner: () => ({
    enqueue: (...args: unknown[]) => enqueueMock(...args),
  }),
}));

describe('bench start/restart orchestration', () => {
  let benchPath = '';

  const bench: Bench = {
    id: '3689f4f1-e649-4124-9166-5b028624e562',
    name: 'rtcamp',
    path: '/tmp/rtcamp',
    frappeVersion: '15.0.0',
    apps: ['frappe'],
    status: 'running',
    httpPort: 8080,
    timestamps: {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  };

  const updateMock = vi.fn(async () => bench);

  let queuedRun: ((context: TaskExecutionContext) => Promise<void>) | null = null;

  const context: TaskExecutionContext = {
    taskId: 'task-bench-start',
    signal: new AbortController().signal,
    startStep: vi.fn(),
    completeStep: vi.fn(),
    log: vi.fn(),
    throwIfCancelled: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queuedRun = null;

    benchPath = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-cafe-bench-start-'));
    fs.mkdirSync(path.join(benchPath, 'overrides'), { recursive: true });
    fs.writeFileSync(path.join(benchPath, 'compose.yaml'), 'services: {}\n', 'utf8');
    fs.writeFileSync(path.join(benchPath, 'overrides', 'compose.mariadb.yaml'), 'services: {}\n', 'utf8');
    fs.writeFileSync(path.join(benchPath, 'overrides', 'compose.redis.yaml'), 'services: {}\n', 'utf8');
    fs.writeFileSync(path.join(benchPath, 'overrides', 'compose.noproxy.yaml'), 'services: {}\n', 'utf8');

    bench.path = benchPath;

    getBinaryPathMock.mockReturnValue('/mock/docker-compose');
    ensureRuntimeRunningMock.mockResolvedValue(true);
    getRuntimeEnvMock.mockResolvedValue({ DOCKER_HOST: 'unix:///tmp/mock.sock' });

    enqueueMock.mockImplementation((definition: { run: (ctx: TaskExecutionContext) => Promise<void> }) => {
      queuedRun = definition.run;
      return 'task-001';
    });
  });

  it('falls back to service verification on compose timeout and marks restart successful', async () => {
    execPromiseMock
      .mockRejectedValueOnce(new Error('Command timed out after 300000ms: /mock/docker-compose ...'))
      .mockResolvedValueOnce({ code: 0, stdout: 'db\nbackend\nfrontend\n', stderr: '' });

    orchestrateBenchStart(
      bench,
      {
        update: updateMock,
      },
      true
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenNthCalledWith(
      1,
      '/mock/docker-compose',
      expect.arrayContaining(['up', '-d', '--force-recreate', '--remove-orphans']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      OPERATION_TIMEOUTS.SITE_CREATION
    );

    expect(execPromiseMock).toHaveBeenNthCalledWith(
      2,
      '/mock/docker-compose',
      expect.arrayContaining(['ps', '--services', '--status', 'running']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      OPERATION_TIMEOUTS.DEFAULT
    );

    expect(updateMock).toHaveBeenCalledWith(bench.id, { status: 'running' });
    expect(context.log).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('Compose timed out, but core services are running'),
      'start'
    );
  });

  it('fails restart when timeout fallback finds core services missing', async () => {
    execPromiseMock
      .mockRejectedValueOnce(new Error('Command timed out after 300000ms: /mock/docker-compose ...'))
      .mockResolvedValueOnce({ code: 0, stdout: 'db\nredis-cache\n', stderr: '' });

    orchestrateBenchStart(
      bench,
      {
        update: updateMock,
      },
      true
    );

    expect(queuedRun).not.toBeNull();
    await expect(queuedRun?.(context)).rejects.toThrow('core services did not come up');
    expect(updateMock).toHaveBeenCalledWith(bench.id, { status: 'failure' });
  });
});
