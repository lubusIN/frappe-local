import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Site } from '../src/shared/domain/models';
import type { TaskExecutionContext } from '../src/main/task-runner';
import { orchestrateSiteStatusUpdate } from '../src/main/site-orchestration';

const execPromiseMock = vi.fn();
const getBinaryPathMock = vi.fn();
const getRuntimeEnvMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock('../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

vi.mock('../src/main/utils/binaries', () => ({
  getBinaryPath: (...args: unknown[]) => getBinaryPathMock(...args),
}));

vi.mock('../src/main/runtime-service', () => ({
  getRuntimeEnv: () => getRuntimeEnvMock(),
}));

vi.mock('../src/main/task-runner', () => ({
  getTaskRunner: () => ({
    enqueue: (...args: unknown[]) => enqueueMock(...args),
  }),
}));

describe('site status orchestration commands', () => {
  const site: Site = {
    id: 'site-001',
    name: 'myfrappe.local',
    benchId: '4db335b2abcdef',
    apps: ['frappe'],
    status: 'stopped',
    path: '/Users/dev/frappe-bench/sites/myfrappe.local',
    timestamps: {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  };

  const updateMock = vi.fn(async () => site);

  let queuedRun: ((context: TaskExecutionContext) => Promise<void>) | null = null;

  const context: TaskExecutionContext = {
    taskId: 'task-site-status',
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

  it('uses bench --site enable-scheduler when starting a site', async () => {
    orchestrateSiteStatusUpdate(
      {
        sites: {
          update: updateMock,
        },
      },
      site,
      'running'
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(1);

    const [command, args, cwd, _onOutput, env] = execPromiseMock.mock.calls[0] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
    ];

    expect(command).toBe('/mock/docker-compose');
    expect(cwd).toBe('');
    expect(env).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(args).toEqual([
      '-p',
      'frappe-cafe-4db335b2',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'myfrappe.local',
      'enable-scheduler',
    ]);
  });

  it('uses bench --site disable-scheduler when stopping a site', async () => {
    orchestrateSiteStatusUpdate(
      {
        sites: {
          update: updateMock,
        },
      },
      site,
      'stopped'
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(1);

    const [, args] = execPromiseMock.mock.calls[0] as [string, string[]];
    expect(args).toEqual([
      '-p',
      'frappe-cafe-4db335b2',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'myfrappe.local',
      'disable-scheduler',
    ]);
  });
});
