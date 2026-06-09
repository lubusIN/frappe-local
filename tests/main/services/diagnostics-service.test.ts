import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runDiagnostics } from '../../../src/main/services/diagnostics-service';
import type { Settings } from '../../../src/shared/domain/models';
import { vi } from 'vitest';

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: vi.fn().mockImplementation((command, args) => {
    if (command === 'podman' && args.includes('ls')) {
      return Promise.resolve({ code: 0, stdout: '[{"Name": "local-bench", "Running": true}]' });
    }
    return Promise.resolve({ code: 0, stdout: '[]' });
  }),
}));

vi.mock('../../../src/main/utils/binaries', () => ({
  getBinaryPath: vi.fn((name: string) => name),
}));

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue({ address: '127.0.0.1', family: 4 }),
  },
  lookup: vi.fn().mockResolvedValue({ address: '127.0.0.1', family: 4 }),
}));

const createdPaths: string[] = [];

import { DEFAULT_SETTINGS } from '../../../src/shared/domain/models';

const seedSettings: Settings = {
  ...DEFAULT_SETTINGS,
  storagePath: '/tmp/local-bench',
};

afterEach(async () => {
  await Promise.all(
    createdPaths.splice(0).map(async (targetPath) => {
      await fs.rm(targetPath, { recursive: true, force: true });
    })
  );
});

describe('diagnostics service', () => {
  it('builds a report from writable paths and runtime health data', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'local-bench-diagnostics-'));
    const storagePath = path.join(userDataPath, 'storage');
    await fs.mkdir(storagePath, { recursive: true });
    createdPaths.push(userDataPath);

    const report = await runDiagnostics({
      runtimePaths: {
        userDataPath,
        logsPath: path.join(userDataPath, 'logs'),
        configPath: path.join(userDataPath, 'config'),
        storagePath,
      },

      settingsRepository: {
        get: async () => ({ ...seedSettings, storagePath }),
      },
      appVersion: '0.1.0',
    });

    expect(report.hasCriticalIssues).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.summary).toContain('All diagnostics passed');
    expect(report.checks.map((check) => check.type)).toEqual(
      expect.arrayContaining(['path-writability', 'storage-access', 'runtime-health'])
    );
  });

  it('reports critical issues when runtime health cannot be collected', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'local-bench-diagnostics-'));
    createdPaths.push(userDataPath);

    const report = await runDiagnostics({
      runtimePaths: {
        userDataPath,
        logsPath: path.join(userDataPath, 'logs'),
        configPath: path.join(userDataPath, 'config'),
        storagePath: path.join(userDataPath, 'missing-storage'),
      },

      settingsRepository: {
        get: async () => ({
          ...seedSettings,
          storagePath: path.join(userDataPath, 'missing-storage'),
        }),
      },
      appVersion: '0.1.0',
    });

    expect(report.hasCriticalIssues).toBe(false);
    expect(report.hasWarnings).toBe(true);
    expect(report.summary).toContain('warning detected');
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        status: 'warning',
        title: expect.stringContaining('Directory Access'),
      })
    );
  });
});
