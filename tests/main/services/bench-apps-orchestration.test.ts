import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Bench } from '../../../src/shared/domain/models';
import type { TaskExecutionContext } from '../../../src/main/services/task-runner';
import { orchestrateBenchAppChanges } from '../../../src/main/services/bench-orchestration';

const execPromiseMock = vi.fn();
const getBinaryPathMock = vi.fn();
const getRuntimeEnvMock = vi.fn();
const ensureRuntimeRunningMock = vi.fn();
const getLastRuntimeErrorMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

vi.mock('../../../src/main/utils/binaries', () => ({
  getBinaryPath: (...args: unknown[]) => getBinaryPathMock(...args),
}));

vi.mock('../../../src/main/services/runtime-service', () => ({
  getRuntimeEnv: () => getRuntimeEnvMock(),
  ensureRuntimeRunning: () => ensureRuntimeRunningMock(),
  getLastRuntimeError: () => getLastRuntimeErrorMock(),
}));

vi.mock('../../../src/main/services/task-runner', () => ({
  getTaskRunner: () => ({
    enqueue: (...args: unknown[]) => enqueueMock(...args),
  }),
}));

describe('bench app orchestration', () => {
  let queuedRun: ((context: TaskExecutionContext) => Promise<void>) | null = null;
  let benchPath = '';

  const context: TaskExecutionContext = {
    taskId: 'task-bench-apps',
    signal: new AbortController().signal,
    startStep: vi.fn(),
    completeStep: vi.fn(),
    log: vi.fn(),
    throwIfCancelled: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queuedRun = null;

    benchPath = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-apps-'));

    getBinaryPathMock.mockImplementation((name: string) => {
      if (name === 'apps.json') return path.resolve(__dirname, '../../../bin/apps.json');
      return `/mock/${name}`;
    });
    getRuntimeEnvMock.mockResolvedValue({ DOCKER_HOST: 'unix:///tmp/mock.sock' });
    ensureRuntimeRunningMock.mockResolvedValue(true);
    getLastRuntimeErrorMock.mockReturnValue(null);
    execPromiseMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    enqueueMock.mockImplementation((definition: { run: (ctx: TaskExecutionContext) => Promise<void> }) => {
      queuedRun = definition.run;
      return 'task-001';
    });
  });

  it('installs new apps and uses catalog metadata when available', async () => {
    const bench: Bench = {
      id: 'bench-apps-001',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const appCatalogRepo = {
      findById: vi.fn(async (id: string) => {
        if (id !== 'payments') return null;
        return {
          id: 'payments',
          name: 'Payments',
          description: 'test',
          source: 'https://github.com/frappe/payments',
          version: '15.0.0',
          category: 'business' as const,
          installBranches: {
            'version-16': 'version-16',
          },
          compatibility: {},
        };
      }),
    };

    const updateMock = vi.fn(async () => bench);

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      appCatalogRepo,
      bench.apps,
      ['frappe', 'erpnext', 'payments']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'get-app', '--overwrite', '--branch', 'version-16', 'https://github.com/frappe/payments']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );
    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['up', '-d', '--remove-orphans', 'frappe']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );
    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      ['-p', 'frappe-local-bench-ap', 'exec', '-T', 'frappe', 'pkill', '-f', 'honcho'],
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );
    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      ['-p', 'frappe-local-bench-ap', 'exec', '-d', 'frappe', 'bench', 'start'],
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(appCatalogRepo.findById).toHaveBeenCalledWith('payments');
    expect(updateMock).toHaveBeenCalledWith(bench.id, { apps: ['frappe', 'erpnext', 'payments'] });
  });

  it('fails before app commands when podman cannot be started', async () => {
    const bench: Bench = {
      id: 'bench-apps-runtime',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    ensureRuntimeRunningMock.mockResolvedValue(false);
    getLastRuntimeErrorMock.mockReturnValue('Podman socket is unavailable.');

    orchestrateBenchAppChanges(
      bench,
      { update: vi.fn(async () => bench) },
      undefined,
      bench.apps,
      ['frappe', 'builder']
    );

    expect(queuedRun).not.toBeNull();
    await expect(queuedRun?.(context)).rejects.toThrow('Podman socket is unavailable.');
    expect(execPromiseMock).not.toHaveBeenCalled();
    expect(getRuntimeEnvMock).not.toHaveBeenCalled();
  });

  it('fails before app commands when bench containers cannot be started', async () => {
    const bench: Bench = {
      id: 'bench-apps-service',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };
    const updateMock = vi.fn(async () => bench);

    execPromiseMock.mockResolvedValueOnce({
      code: 1,
      stdout: '',
      stderr: 'service frappe failed to start',
    });

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      undefined,
      bench.apps,
      ['frappe', 'builder']
    );

    expect(queuedRun).not.toBeNull();
    await expect(queuedRun?.(context)).rejects.toThrow('Could not start bench containers');
    expect(execPromiseMock).toHaveBeenCalledTimes(1);
    expect(execPromiseMock.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(['up', '-d', '--remove-orphans', 'frappe'])
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('restarts bench processes and preserves apps when app download fails', async () => {
    const bench: Bench = {
      id: 'bench-apps-recovery',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };
    const updateMock = vi.fn(async () => bench);
    fs.mkdirSync(path.join(benchPath, 'apps', 'builder'), { recursive: true });
    fs.mkdirSync(path.join(benchPath, 'sites', 'frappe.localhost'), { recursive: true });
    fs.mkdirSync(path.join(benchPath, 'sites', 'assets', 'builder'), { recursive: true });
    fs.writeFileSync(path.join(benchPath, 'sites', 'apps.txt'), 'frappe\nbuilder\n', 'utf8');
    fs.writeFileSync(path.join(benchPath, 'sites', 'common_site_config.json'), '{}', 'utf8');

    execPromiseMock.mockImplementation(async (_command: string, args: string[]) => {
      if (args.includes('get-app')) {
        return { code: 1, stdout: '', stderr: 'clone failed' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      undefined,
      bench.apps,
      ['frappe', 'builder']
    );

    expect(queuedRun).not.toBeNull();
    await expect(queuedRun?.(context)).rejects.toThrow('Failed to fetch app builder');
    expect(updateMock).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(benchPath, 'apps', 'builder'))).toBe(false);
    expect(fs.existsSync(path.join(benchPath, 'sites', 'assets', 'builder'))).toBe(false);
    expect(fs.readFileSync(path.join(benchPath, 'sites', 'apps.txt'), 'utf8')).toBe('frappe\n');
    expect(
      JSON.parse(fs.readFileSync(path.join(benchPath, 'sites', 'common_site_config.json'), 'utf8'))
    ).toMatchObject({ default_site: 'frappe.localhost', socketio_port: 443 });
    expect(fs.readFileSync(path.join(benchPath, 'Procfile'), 'utf8')).toContain(
      'socketio: FRAPPE_SOCKETIO_PORT=9000 node apps/frappe/socketio.js'
    );
    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'pip', 'uninstall', '-y', 'builder']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ signal: null })
    );
    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'build']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ signal: null })
    );
    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      ['-p', 'frappe-local-bench-ap', 'exec', '-d', 'frappe', 'bench', 'start'],
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ signal: null })
    );

    const rebuildCallIndex = execPromiseMock.mock.calls.findIndex((call) => {
      const args = call[1] as string[];
      return args.includes('build');
    });
    const restartCallIndex = execPromiseMock.mock.calls.findIndex((call) => {
      const args = call[1] as string[];
      return args.includes('start');
    });
    expect(rebuildCallIndex).toBeGreaterThan(-1);
    expect(restartCallIndex).toBeGreaterThan(rebuildCallIndex);
  });

  it('prefers explicit catalog install branch over version-derived branch', async () => {
    const bench: Bench = {
      id: 'bench-apps-003',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const appCatalogRepo = {
      findById: vi.fn(async (id: string) => {
        if (id !== 'builder') return null;
        return {
          id: 'builder',
          name: 'Frappe Builder',
          description: 'test',
          source: 'https://github.com/frappe/builder',
          installBranch: 'develop',
          version: '16.0.0',
          category: 'tools' as const,
          compatibility: {
            minimumFrappeVersion: '15.0.0',
          },
        };
      }),
    };

    const updateMock = vi.fn(async () => bench);

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      appCatalogRepo,
      bench.apps,
      ['frappe', 'erpnext', 'builder']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'get-app', '--overwrite', '--branch', 'develop', 'https://github.com/frappe/builder']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

  });

  it('uses branch matrix metadata for helpdesk installs', async () => {
    const bench: Bench = {
      id: 'bench-apps-004',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const appCatalogRepo = {
      findById: vi.fn(async (id: string) => {
        if (id !== 'helpdesk') return null;
        return {
          id: 'helpdesk',
          name: 'Frappe Helpdesk',
          description: 'test',
          source: 'https://github.com/frappe/helpdesk',
          installBranch: 'main',
          installBranches: {
            'version-15': 'main',
            'version-16': 'main',
            develop: 'develop',
          },
          version: 'v1.24.1',
          category: 'crm-support' as const,
          compatibility: {
            supportedBenchVersions: ['version-15', 'version-16', 'develop'],
          },
        };
      }),
    };

    const updateMock = vi.fn(async () => bench);

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      appCatalogRepo,
      bench.apps,
      ['frappe', 'erpnext', 'helpdesk']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'get-app', '--branch', 'main', 'https://github.com/frappe/helpdesk']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );
  });

  it('falls back to default catalog branch matrix when stored metadata is stale', async () => {
    const bench: Bench = {
      id: 'bench-apps-006',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const appCatalogRepo = {
      findById: vi.fn(async (id: string) => {
        if (id !== 'wiki') return null;
        return {
          id: 'wiki',
          name: 'Wiki',
          description: 'stale catalog item',
          source: 'https://github.com/frappe/wiki',
          installBranch: 'master',
          version: 'v2.0.1',
          category: 'productivity' as const,
          compatibility: {
            supportedBenchVersions: ['version-15', 'version-16', 'develop'],
          },
        };
      }),
    };

    const updateMock = vi.fn(async () => bench);

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      appCatalogRepo,
      bench.apps,
      ['frappe', 'erpnext', 'wiki']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'get-app', '--branch', 'master', 'https://github.com/frappe/wiki']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );
  });

  it('removes deleted apps with bench remove-app', async () => {
    const bench: Bench = {
      id: 'bench-apps-002',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext', 'payments'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const updateMock = vi.fn(async () => bench);

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      undefined,
      bench.apps,
      ['frappe', 'erpnext']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'remove-app', 'payments']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(updateMock).toHaveBeenCalledWith(bench.id, { apps: ['frappe', 'erpnext'] });
  });

  it('retries app fetch once when get-app times out', async () => {
    const bench: Bench = {
      id: 'bench-apps-005',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const updateMock = vi.fn(async () => bench);
    const timeoutError = new Error('Command timed out after 1200000ms: docker-compose exec -T backend bench get-app ...');

    execPromiseMock
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      undefined,
      bench.apps,
      ['frappe', 'erpnext', 'builder']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    const getAppCalls = execPromiseMock.mock.calls.filter((call) => {
      const args = call[1] as string[];
      return args.includes('get-app');
    });

    expect(getAppCalls).toHaveLength(2);
    expect(updateMock).toHaveBeenCalledWith(bench.id, { apps: ['frappe', 'erpnext', 'builder'] });
  });

  it('allows removing a pre-bundled app like erpnext post-creation', async () => {
    const bench: Bench = {
      id: 'bench-apps-007',
      name: 'bench-apps',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext'],
      status: 'running',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const updateMock = vi.fn(async () => bench);

    orchestrateBenchAppChanges(
      bench,
      { update: updateMock },
      undefined,
      bench.apps,
      ['frappe']
    );

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/docker-compose',
      expect.arrayContaining(['exec', '-T', 'frappe', 'bench', 'remove-app', 'erpnext']),
      benchPath,
      expect.any(Function),
      expect.objectContaining({ DOCKER_HOST: 'unix:///tmp/mock.sock' }),
      expect.objectContaining({ idleTimeout: expect.any(Number) })
    );

    expect(updateMock).toHaveBeenCalledWith(bench.id, { apps: ['frappe'] });
  });
});
