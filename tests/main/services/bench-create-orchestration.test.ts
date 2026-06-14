import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Bench } from '../../../src/shared/domain/models';
import type { TaskExecutionContext } from '../../../src/main/services/task-runner';
import { orchestrateBenchCreation } from '../../../src/main/services/bench-orchestration';

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

vi.mock('../../../src/main/utils/ports', () => ({
  findNextAvailableTcpPort: vi.fn(async (startPort: number) => startPort),
  isTcpPortFree: vi.fn(async () => true),
}));

describe('bench creation orchestration app install', () => {
  let queuedRun: ((context: TaskExecutionContext) => Promise<void>) | null = null;
  let benchPath = '';

  const context: TaskExecutionContext = {
    taskId: 'task-bench-create',
    signal: new AbortController().signal,
    startStep: vi.fn(),
    completeStep: vi.fn(),
    log: vi.fn(),
    throwIfCancelled: vi.fn(),
  };

  const updateMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queuedRun = null;

    benchPath = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bench-create-'));

    getBinaryPathMock.mockImplementation((name: string) => {
      if (name === 'apps.json') return path.resolve(__dirname, '../../../bin/apps.json');
      return `/mock/${name}`;
    });
    ensureRuntimeRunningMock.mockResolvedValue(true);
    getRuntimeEnvMock.mockResolvedValue({ DOCKER_HOST: 'unix:///tmp/mock.sock' });

    updateMock.mockResolvedValue(null);

    execPromiseMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    execPromiseMock
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: 'healthy\n', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

    enqueueMock.mockImplementation((definition: { run: (ctx: TaskExecutionContext) => Promise<void> }) => {
      queuedRun = definition.run;
      return 'task-001';
    });
  });

  it('runs bench get-app only for non-preinstalled selected apps', async () => {
    const bench: Bench = {
      id: 'b3f8f8ec-aaaa-bbbb-cccc-1234567890ab',
      name: 'custom-bench',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext', 'payments', 'hrms'],
      status: 'queued',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    orchestrateBenchCreation(bench, { update: updateMock });

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    const getAppCalls = execPromiseMock.mock.calls.filter((call) => {
      const args = call[1] as string[];
      return args.includes('get-app');
    });

    expect(getAppCalls).toHaveLength(2);

    const getAppArgs = getAppCalls.map((call) => call[1] as string[]);
    expect(getAppArgs[0]).toEqual(
      expect.arrayContaining(['exec', '-T', 'backend', 'bench', 'get-app', '--overwrite', '--branch', 'version-16', 'payments'])
    );
    expect(getAppArgs[1]).toEqual(
      expect.arrayContaining(['exec', '-T', 'backend', 'bench', 'get-app', '--overwrite', '--branch', 'version-16', 'hrms'])
    );

    expect(updateMock).toHaveBeenCalledWith(bench.id, { status: 'running' });
  });

  it('uses app catalog source and catalog major-version branch when available', async () => {
    const bench: Bench = {
      id: 'c4f8f8ec-aaaa-bbbb-cccc-1234567890ab',
      name: 'catalog-bench',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext', 'ecommerce_integrations'],
      status: 'queued',
      httpPort: 8080,
      timestamps: {
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
    };

    const appCatalogRepo = {
      findById: vi.fn(async (id: string) => {
        if (id !== 'ecommerce_integrations') return null;
        return {
          id: 'ecommerce_integrations',
          name: 'eCommerce Integrations',
          description: 'test',
          source: 'https://github.com/frappe/ecommerce_integrations',
          version: '15.0.0',
          category: 'business' as const,
          installBranches: {
            'version-16': 'version-16',
          },
          compatibility: {
            minimumFrappeVersion: '15.0.0',
            maximumFrappeVersion: '15.999.999',
          },
        };
      }),
    };

    orchestrateBenchCreation(bench, { update: updateMock }, appCatalogRepo);

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    const getAppCall = execPromiseMock.mock.calls.find((call) => {
      const args = call[1] as string[];
      return args.includes('get-app') && args.includes('https://github.com/frappe/ecommerce_integrations');
    });

    expect(getAppCall).toBeTruthy();
    expect(getAppCall?.[1]).toEqual(
      expect.arrayContaining([
        'exec',
        '-T',
        'backend',
        'bench',
        'get-app',
        '--branch',
        'version-16',
        'https://github.com/frappe/ecommerce_integrations',
      ])
    );
    expect(appCatalogRepo.findById).toHaveBeenCalledWith('ecommerce_integrations');
  });

  it('uses explicit catalog install branch when provided', async () => {
    const bench: Bench = {
      id: 'c4f8f8ec-dddd-eeee-ffff-1234567890ab',
      name: 'catalog-bench-branch',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext', 'builder'],
      status: 'queued',
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

    orchestrateBenchCreation(bench, { update: updateMock }, appCatalogRepo);

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    const getAppCall = execPromiseMock.mock.calls.find((call) => {
      const args = call[1] as string[];
      return args.includes('get-app') && args.includes('https://github.com/frappe/builder');
    });

    expect(getAppCall).toBeTruthy();
    expect(getAppCall?.[1]).toEqual(
      expect.arrayContaining([
        'exec',
        '-T',
        'backend',
        'bench',
        'get-app',
        '--branch',
        'develop',
        'https://github.com/frappe/builder',
      ])
    );
  });

  it('uses branch matrix metadata for helpdesk installs', async () => {
    const bench: Bench = {
      id: 'c4f8f8ec-dddd-eeee-ffff-abcdef123456',
      name: 'catalog-bench-helpdesk',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext', 'helpdesk'],
      status: 'queued',
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

    orchestrateBenchCreation(bench, { update: updateMock }, appCatalogRepo);

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    const getAppCall = execPromiseMock.mock.calls.find((call) => {
      const args = call[1] as string[];
      return args.includes('get-app') && args.includes('https://github.com/frappe/helpdesk');
    });

    expect(getAppCall).toBeTruthy();
    expect(getAppCall?.[1]).toEqual(
      expect.arrayContaining([
        'exec',
        '-T',
        'backend',
        'bench',
        'get-app',
        '--branch',
        'main',
        'https://github.com/frappe/helpdesk',
      ])
    );
  });

  it('falls back to default catalog matrix when stored wiki metadata is stale', async () => {
    const bench: Bench = {
      id: 'c4f8f8ec-ffff-aaaa-bbbb-1234567890ab',
      name: 'catalog-bench-wiki',
      path: benchPath,
      frappeVersion: 'version-16',
      apps: ['frappe', 'erpnext', 'wiki'],
      status: 'queued',
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

    orchestrateBenchCreation(bench, { update: updateMock }, appCatalogRepo);

    expect(queuedRun).not.toBeNull();
    await queuedRun?.(context);

    const getAppCall = execPromiseMock.mock.calls.find((call) => {
      const args = call[1] as string[];
      return args.includes('get-app') && args.includes('https://github.com/frappe/wiki');
    });

    expect(getAppCall).toBeTruthy();
    expect(getAppCall?.[1]).toEqual(
      expect.arrayContaining([
        'exec',
        '-T',
        'backend',
        'bench',
        'get-app',
        '--branch',
        'master',
        'https://github.com/frappe/wiki',
      ])
    );
  });
});
