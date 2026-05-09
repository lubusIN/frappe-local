import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bench, Site } from '../src/shared/domain/models';
import type { TaskExecutionContext } from '../src/main/task-runner';
import { OPERATION_TIMEOUTS } from '../src/main/constants';
import { orchestrateSiteCreation } from '../src/main/site-orchestration';

const execPromiseMock = vi.fn();
const getBinaryPathMock = vi.fn();
const getRuntimeEnvMock = vi.fn();
const addHostsEntryMock = vi.fn();
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

vi.mock('../src/main/hosts-manager', () => ({
  addHostsEntry: (...args: unknown[]) => addHostsEntryMock(...args),
  removeHostsEntry: async () => true,
}));

vi.mock('../src/main/task-runner', () => ({
  getTaskRunner: () => ({
    enqueue: (...args: unknown[]) => enqueueMock(...args),
  }),
}));

describe('site orchestration command execution', () => {
  const bench: Bench = {
    id: '1adb2eed-aaaa-bbbb-cccc-000000000001',
    name: 'bench-two',
    path: '/Users/dev/bench-two',
    frappeVersion: '15.0.0',
    status: 'running',
    apps: ['frappe'],
    timestamps: {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  };

  const createdSite: Site = {
    id: 'site-001',
    name: 'frappevault.localhost',
    benchId: bench.id,
    path: '/Users/dev/bench-two/sites/frappevault.localhost',
    apps: ['frappe'],
    status: 'queued',
    timestamps: {
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  };

  let queuedRun: ((context: TaskExecutionContext) => Promise<void>) | null = null;

  const context: TaskExecutionContext = {
    taskId: 'task-site-create',
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
    addHostsEntryMock.mockResolvedValue(true);
    execPromiseMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    enqueueMock.mockImplementation((definition: { run: (ctx: TaskExecutionContext) => Promise<void> }) => {
      queuedRun = definition.run;
      return 'task-001';
    });
  });

  it('uses docker-compose exec -T for bench new-site with bounded timeout', async () => {
    await orchestrateSiteCreation(
      {
        benches: {
          findById: async () => bench,
        },
        sites: {
          create: async () => createdSite,
          update: async () => createdSite,
        },
      },
      {
        name: 'frappevault.localhost',
        benchId: bench.id,
        path: createdSite.path,
        apps: ['frappe'],
      }
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(1);

    const [command, args, cwd, _onOutput, env, timeout] = execPromiseMock.mock.calls[0] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      number,
    ];

    expect(command).toBe('/mock/docker-compose');
    expect(cwd).toBe('/Users/dev/bench-two');
    expect(env).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(timeout).toBe(OPERATION_TIMEOUTS.SITE_CREATION);
    expect(args).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      'new-site',
      '--mariadb-user-host-login-scope',
      '%',
      '--db-host',
      'db',
      '--admin-password',
      'admin',
      '--db-root-password',
      '123',
      '--install-app',
      'frappe',
      'frappevault.localhost',
    ]);
  });
});
