import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Site } from '../../../src/shared/domain/models';
import type { TaskExecutionContext } from '../../../src/main/services/task-runner';
import { OPERATION_TIMEOUTS } from '../../../src/main/constants';
import { orchestrateSiteStatusUpdate } from '../../../src/main/services/site-orchestration';

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
  const findBenchByIdMock = vi.fn(async () => ({
    id: site.benchId,
    name: 'bench-1',
    path: '/Users/dev/frappe-bench',
    frappeVersion: 'v15.0.0',
    apps: ['frappe'],
    status: 'running' as const,
    timestamps: {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  }));

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
        benches: {
          findById: findBenchByIdMock,
        },
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

    const [command, args, cwd, , env, timeout] = execPromiseMock.mock.calls[0] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      number,
    ];

    expect(command).toBe('/mock/docker-compose');
    expect(cwd).toBe('/Users/dev/frappe-bench');
    expect(env).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(timeout).toBe(OPERATION_TIMEOUTS.SITE_STATUS_UPDATE);
    expect(args).toEqual([
      '-p',
      'local-bench-4db335b2',
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
        benches: {
          findById: findBenchByIdMock,
        },
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
      'local-bench-4db335b2',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'myfrappe.local',
      'disable-scheduler',
    ]);
  });

  it('retries timeout failures up to three total attempts', async () => {
    execPromiseMock
      .mockRejectedValueOnce(new Error('Command timed out after 180000ms: /mock/docker-compose ...'))
      .mockRejectedValueOnce(new Error('Command timed out after 180000ms: /mock/docker-compose ...'))
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 });

    orchestrateSiteStatusUpdate(
      {
        benches: {
          findById: findBenchByIdMock,
        },
        sites: {
          update: updateMock,
        },
      },
      site,
      'running'
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(3);
    expect(context.log).toHaveBeenCalledWith('warning', expect.stringContaining('attempt 1/3'));
    expect(context.log).toHaveBeenCalledWith('warning', expect.stringContaining('attempt 2/3'));
  });

  it('treats already-disabled scheduler output as success', async () => {
    execPromiseMock.mockResolvedValueOnce({
      stdout: '',
      stderr: 'Scheduler is already disabled for site myfrappe.local',
      code: 1,
    });

    orchestrateSiteStatusUpdate(
      {
        benches: {
          findById: findBenchByIdMock,
        },
        sites: {
          update: updateMock,
        },
      },
      site,
      'stopped'
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(updateMock).toHaveBeenCalledWith(site.id, { status: 'stopped' });
    expect(context.log).toHaveBeenCalledWith('warning', expect.stringContaining('already in desired state'));
  });

  it('clears cache for sites with non-core apps when starting a site', async () => {
    const siteWithCustomApp: Site = {
      ...site,
      apps: ['frappe', 'builder'],
    };

    orchestrateSiteStatusUpdate(
      {
        benches: {
          findById: findBenchByIdMock,
        },
        sites: {
          update: updateMock,
        },
      },
      siteWithCustomApp,
      'running'
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(3);

    const [, schedulerArgs] = execPromiseMock.mock.calls[0] as [string, string[]];
    expect(schedulerArgs).toEqual([
      '-p',
      'local-bench-4db335b2',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'myfrappe.local',
      'enable-scheduler',
    ]);

    const [, clearCacheArgs] = execPromiseMock.mock.calls[1] as [string, string[]];
    expect(clearCacheArgs).toEqual([
      '-p',
      'local-bench-4db335b2',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'myfrappe.local',
      'clear-cache',
    ]);

    const [, clearWebsiteCacheArgs] = execPromiseMock.mock.calls[2] as [string, string[]];
    expect(clearWebsiteCacheArgs).toEqual([
      '-p',
      'local-bench-4db335b2',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'myfrappe.local',
      'clear-website-cache',
    ]);
  });
});
