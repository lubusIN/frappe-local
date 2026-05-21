import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bench, Site } from '../src/shared/domain/models';
import type { TaskExecutionContext } from '../src/main/task-runner';
import { OPERATION_TIMEOUTS } from '../src/main/constants';
import { orchestrateSiteAppsUpdate, orchestrateSiteCreation } from '../src/main/site-orchestration';

const execPromiseMock = vi.fn();
const getBinaryPathMock = vi.fn();
const getRuntimeEnvMock = vi.fn();
const enqueueMock = vi.fn();
const updateSiteMock = vi.fn();

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
    execPromiseMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    updateSiteMock.mockResolvedValue(createdSite);

    enqueueMock.mockImplementation((definition: { run: (ctx: TaskExecutionContext) => Promise<void> }) => {
      queuedRun = definition.run;
      return 'task-001';
    });
  });

  it('uses docker-compose exec -T for bench new-site and runs site post-create commands without build', async () => {
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

    expect(execPromiseMock).toHaveBeenCalledTimes(5);

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

    const [, migrateArgs] = execPromiseMock.mock.calls[1] as [string, string[]];
    expect(migrateArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'frappevault.localhost',
      'migrate',
    ]);

    const [, clearCacheArgs] = execPromiseMock.mock.calls[2] as [string, string[]];
    expect(clearCacheArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'frappevault.localhost',
      'clear-cache',
    ]);

    const [, clearWebsiteCacheArgs] = execPromiseMock.mock.calls[3] as [string, string[]];
    expect(clearWebsiteCacheArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'frappevault.localhost',
      'clear-website-cache',
    ]);

    const [, restartArgs] = execPromiseMock.mock.calls[4] as [string, string[]];
    expect(restartArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'restart',
      'backend',
      'frontend',
      'websocket',
    ]);

    const calledCommands = execPromiseMock.mock.calls.map((call) => (call[1] as string[]).join(' '));
    expect(calledCommands.some((argsString) => argsString.includes(' bench build '))).toBe(false);
  });

  it('runs install-app, migrate, clear-cache, clear-website-cache, and restart when activating new site apps', async () => {
    orchestrateSiteAppsUpdate(
      {
        benches: {
          findById: async () => bench,
        },
        sites: {
          update: updateSiteMock,
        },
      },
      {
        ...createdSite,
        status: 'running',
      },
      ['frappe', 'erpnext']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledTimes(5);

    const [installCommand, installArgs, installCwd, _installOutput, installEnv, installTimeout] = execPromiseMock.mock.calls[0] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      number,
    ];

    expect(installCommand).toBe('/mock/docker-compose');
    expect(installCwd).toBe('/Users/dev/bench-two');
    expect(installEnv).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(installTimeout).toBe(OPERATION_TIMEOUTS.APP_INSTALL);
    expect(installArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'frappevault.localhost',
      'install-app',
      'erpnext',
    ]);

    const [migrateCommand, migrateArgs, migrateCwd, _migrateOutput, migrateEnv, migrateTimeout] = execPromiseMock.mock.calls[1] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      number,
    ];

    expect(migrateCommand).toBe('/mock/docker-compose');
    expect(migrateCwd).toBe('/Users/dev/bench-two');
    expect(migrateEnv).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(migrateTimeout).toBe(OPERATION_TIMEOUTS.APP_INSTALL);
    expect(migrateArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'frappevault.localhost',
      'migrate',
    ]);

    const [clearCacheCommand, clearCacheArgs, clearCacheCwd, _clearCacheOutput, clearCacheEnv, clearCacheTimeout] = execPromiseMock.mock.calls[2] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      number,
    ];

    expect(clearCacheCommand).toBe('/mock/docker-compose');
    expect(clearCacheCwd).toBe('/Users/dev/bench-two');
    expect(clearCacheEnv).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(clearCacheTimeout).toBe(OPERATION_TIMEOUTS.DEFAULT);
    expect(clearCacheArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'frappevault.localhost',
      'clear-cache',
    ]);

    const [clearWebsiteCacheCommand, clearWebsiteCacheArgs, clearWebsiteCacheCwd, _clearWebsiteCacheOutput, clearWebsiteCacheEnv, clearWebsiteCacheTimeout] = execPromiseMock.mock.calls[3] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      number,
    ];

    expect(clearWebsiteCacheCommand).toBe('/mock/docker-compose');
    expect(clearWebsiteCacheCwd).toBe('/Users/dev/bench-two');
    expect(clearWebsiteCacheEnv).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(clearWebsiteCacheTimeout).toBe(OPERATION_TIMEOUTS.DEFAULT);
    expect(clearWebsiteCacheArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'exec',
      '-T',
      'backend',
      'bench',
      '--site',
      'frappevault.localhost',
      'clear-website-cache',
    ]);

    const [restartCommand, restartArgs, restartCwd, _restartOutput, restartEnv, restartTimeout] = execPromiseMock.mock.calls[4] as [
      string,
      string[],
      string,
      unknown,
      NodeJS.ProcessEnv,
      number,
    ];

    expect(restartCommand).toBe('/mock/docker-compose');
    expect(restartCwd).toBe('/Users/dev/bench-two');
    expect(restartEnv).toMatchObject({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    expect(restartTimeout).toBe(OPERATION_TIMEOUTS.SITE_STATUS_UPDATE);
    expect(restartArgs).toEqual([
      '-p',
      'local-bench-1adb2eed',
      'restart',
      'backend',
      'frontend',
      'websocket',
    ]);

    expect(updateSiteMock).toHaveBeenCalledWith('site-001', {
      apps: ['frappe', 'erpnext'],
      status: 'running',
    });
  });
});
