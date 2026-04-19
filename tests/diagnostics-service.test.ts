import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runDiagnostics } from '../src/main/diagnostics-service';
import type { Settings } from '../src/shared/domain/models';

const createdPaths: string[] = [];

const seedSettings: Settings = {
  defaultFrappeVersion: '15.0.0',
  runtimePreference: 'docker',
  storagePath: '/tmp/frappe-cafe',
  terminalPreference: 'zsh',
  editorPreference: 'code',
  updateChannel: 'stable',
  autoUpdateEnabled: true,
  sidebarCompact: false,
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
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-diagnostics-'));
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
      runtimeService: {
        getHealth: async () => ({
          preferredRuntime: 'docker',
          selectedRuntime: 'docker',
          fallbackRuntime: null,
          fallbackApplied: false,
          dependencies: [
            {
              dependency: 'git',
              status: 'ready',
              detectedVersion: '2.39.0',
              requiredVersion: '2.39.0',
              summary: 'Git is ready.',
              guidance: {
                title: 'Git',
                steps: ['No action needed.'],
              },
            },
          ],
          blockingDependencies: [],
          hasBlockingIssues: false,
        }),
      },
      settingsRepository: {
        get: async () => seedSettings,
      },
      appVersion: '0.1.0',
    });

    expect(report.hasCriticalIssues).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.summary).toContain('All diagnostics passed');
    expect(report.checks.map((check) => check.type)).toEqual(
      expect.arrayContaining(['path-writability', 'storage-access', 'runtime-preference', 'git'])
    );
  });

  it('reports critical issues when runtime health cannot be collected', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-diagnostics-'));
    createdPaths.push(userDataPath);

    const report = await runDiagnostics({
      runtimePaths: {
        userDataPath,
        logsPath: path.join(userDataPath, 'logs'),
        configPath: path.join(userDataPath, 'config'),
        storagePath: path.join(userDataPath, 'missing-storage'),
      },
      runtimeService: {
        getHealth: async () => {
          throw new Error('probe timeout');
        },
      },
      settingsRepository: {
        get: async () => seedSettings,
      },
      appVersion: '0.1.0',
    });

    expect(report.hasCriticalIssues).toBe(true);
    expect(report.summary).toContain('critical issue');
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        title: 'Dependency health check',
      })
    );
  });
});