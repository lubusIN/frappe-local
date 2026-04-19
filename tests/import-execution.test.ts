import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportSitePackage } from '../src/main/export-package-writer';
import { executeImportPackage } from '../src/main/import-execution';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const buildExportFixture = async (outputDirectory: string) => {
  return exportSitePackage(
    {
      benches: {
        findById: async (id: string) =>
          id === 'source-bench'
            ? {
                id: 'source-bench',
                name: 'Source Bench',
                path: '/Users/example/source-bench',
                frappeVersion: '15.0.0',
                runtime: 'docker',
                status: 'running',
                apps: ['frappe', 'erpnext'],
                timestamps: {
                  createdAt: '2026-04-19T00:00:00.000Z',
                  updatedAt: '2026-04-19T00:00:00.000Z',
                },
              }
            : null,
      },
      sites: {
        findById: async (id: string) =>
          id === 'source-site'
            ? {
                id: 'source-site',
                name: 'alpha.localhost',
                benchId: 'source-bench',
                groupId: null,
                apps: ['frappe', 'erpnext'],
                status: 'running',
                path: '/Users/example/source-bench/sites/alpha.localhost',
                timestamps: {
                  createdAt: '2026-04-19T00:00:00.000Z',
                  updatedAt: '2026-04-19T00:00:00.000Z',
                },
              }
            : null,
      },
      groups: { findAll: async () => [] },
      settings: {
        get: async () => ({
          defaultFrappeVersion: '15.0.0',
          runtimePreference: 'docker',
          storagePath: outputDirectory,
          terminalPreference: 'zsh',
          editorPreference: 'code',
          updateChannel: 'stable',
          autoUpdateEnabled: true,
          sidebarCompact: false,
        }),
      },
      appCatalog: {
        findAll: async () => [
          {
            id: 'frappe',
            name: 'Frappe',
            description: 'Core framework',
            source: 'frappe/frappe',
            version: '15.0.0',
            compatibility: { supportedRuntimes: ['docker', 'podman'] },
          },
          {
            id: 'erpnext',
            name: 'ERPNext',
            description: 'ERP app',
            source: 'frappe/erpnext',
            version: '15.0.0',
            compatibility: { supportedRuntimes: ['docker'] },
          },
        ],
      },
      storageMetadata: { schemaVersion: 1, appCatalogSeedVersion: 2 },
    },
    {
      siteId: 'source-site',
      outputDirectory,
    }
  );
};

describe('import execution', () => {
  it('blocks import when conflict policy is block and a matching site exists', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-exec-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await buildExportFixture(outputDirectory);

    const result = await executeImportPackage(
      {
        benches: {
          findById: async (id: string) =>
            id === 'target-bench'
              ? {
                  id: 'target-bench',
                  name: 'Target Bench',
                  path: '/Users/example/target-bench',
                  frappeVersion: '15.0.0',
                  runtime: 'docker',
                  status: 'running',
                  apps: ['frappe'],
                  timestamps: {
                    createdAt: '2026-04-19T00:00:00.000Z',
                    updatedAt: '2026-04-19T00:00:00.000Z',
                  },
                }
              : null,
        },
        sites: {
          findAll: async () => [
            {
              id: 'existing-site',
              name: 'alpha.localhost',
              benchId: 'target-bench',
              groupId: null,
              apps: ['frappe'],
              status: 'running',
              path: '/Users/example/target-bench/sites/alpha.localhost',
              timestamps: {
                createdAt: '2026-04-19T00:00:00.000Z',
                updatedAt: '2026-04-19T00:00:00.000Z',
              },
            },
          ],
          create: async () => {
            throw new Error('create should not be called');
          },
          delete: async () => false,
        },
        groups: {
          findAll: async () => [],
          update: async () => null,
        },
        settings: {
          get: async () => ({
            defaultFrappeVersion: '15.0.0',
            runtimePreference: 'docker',
            storagePath: outputDirectory,
            terminalPreference: 'zsh',
            editorPreference: 'code',
            updateChannel: 'stable',
            autoUpdateEnabled: true,
            sidebarCompact: false,
          }),
        },
        appCatalog: {
          findAll: async () => [
            {
              id: 'frappe',
              name: 'Frappe',
              description: 'Core framework',
              source: 'frappe/frappe',
              version: '15.0.0',
              compatibility: { supportedRuntimes: ['docker', 'podman'] },
            },
            {
              id: 'erpnext',
              name: 'ERPNext',
              description: 'ERP app',
              source: 'frappe/erpnext',
              version: '15.0.0',
              compatibility: { supportedRuntimes: ['docker'] },
            },
          ],
        },
      },
      {
        artifactDirectory: exportResult.artifactDirectory,
        benchId: 'target-bench',
        conflictPolicy: 'block',
      }
    );

    expect(result.success).toBe(false);
    expect(result.createdSiteId).toBeNull();
    expect(result.steps.some((step) => step.name === 'conflict-policy' && step.status === 'failed')).toBe(true);
  });

  it('renames and imports the site when conflict policy is rename', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-exec-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await buildExportFixture(outputDirectory);

    const createdSites: Array<{ id: string; name: string }> = [];

    const result = await executeImportPackage(
      {
        benches: {
          findById: async (id: string) =>
            id === 'target-bench'
              ? {
                  id: 'target-bench',
                  name: 'Target Bench',
                  path: '/Users/example/target-bench',
                  frappeVersion: '15.0.0',
                  runtime: 'docker',
                  status: 'running',
                  apps: ['frappe'],
                  timestamps: {
                    createdAt: '2026-04-19T00:00:00.000Z',
                    updatedAt: '2026-04-19T00:00:00.000Z',
                  },
                }
              : null,
        },
        sites: {
          findAll: async () => [
            {
              id: 'existing-site',
              name: 'alpha.localhost',
              benchId: 'target-bench',
              groupId: null,
              apps: ['frappe'],
              status: 'running',
              path: '/Users/example/target-bench/sites/alpha.localhost',
              timestamps: {
                createdAt: '2026-04-19T00:00:00.000Z',
                updatedAt: '2026-04-19T00:00:00.000Z',
              },
            },
          ],
          create: async (input) => {
            const created = {
              id: 'new-site',
              ...input,
              timestamps: {
                createdAt: '2026-04-19T00:00:00.000Z',
                updatedAt: '2026-04-19T00:00:00.000Z',
              },
            };
            createdSites.push({ id: created.id, name: created.name });
            return created;
          },
          delete: async () => true,
        },
        groups: {
          findAll: async () => [],
          update: async () => null,
        },
        settings: {
          get: async () => ({
            defaultFrappeVersion: '15.0.0',
            runtimePreference: 'docker',
            storagePath: outputDirectory,
            terminalPreference: 'zsh',
            editorPreference: 'code',
            updateChannel: 'stable',
            autoUpdateEnabled: true,
            sidebarCompact: false,
          }),
        },
        appCatalog: {
          findAll: async () => [
            {
              id: 'frappe',
              name: 'Frappe',
              description: 'Core framework',
              source: 'frappe/frappe',
              version: '15.0.0',
              compatibility: { supportedRuntimes: ['docker', 'podman'] },
            },
            {
              id: 'erpnext',
              name: 'ERPNext',
              description: 'ERP app',
              source: 'frappe/erpnext',
              version: '15.0.0',
              compatibility: { supportedRuntimes: ['docker'] },
            },
          ],
        },
      },
      {
        artifactDirectory: exportResult.artifactDirectory,
        benchId: 'target-bench',
        conflictPolicy: 'rename',
      }
    );

    expect(result.success).toBe(true);
    expect(result.createdSiteId).toBe('new-site');
    expect(result.siteName).toContain('alpha.localhost-import-');
    expect(createdSites[0]?.name).toBe(result.siteName);

    const operationsLog = await readFile(path.join(outputDirectory, 'import-operations.jsonl'), 'utf8');
    expect(operationsLog).toContain('"status":"success"');
    expect(operationsLog).toContain('"targetBenchId":"target-bench"');
  });

  it('rolls back created records when execution fails after site creation', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-exec-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await buildExportFixture(outputDirectory);

    const deletedSiteIds: string[] = [];

    const result = await executeImportPackage(
      {
        benches: {
          findById: async (id: string) =>
            id === 'target-bench'
              ? {
                  id: 'target-bench',
                  name: 'Target Bench',
                  path: '/Users/example/target-bench',
                  frappeVersion: '15.0.0',
                  runtime: 'docker',
                  status: 'running',
                  apps: ['frappe'],
                  timestamps: {
                    createdAt: '2026-04-19T00:00:00.000Z',
                    updatedAt: '2026-04-19T00:00:00.000Z',
                  },
                }
              : null,
        },
        sites: {
          findAll: async () => [],
          create: async (input) => ({
            id: 'new-site',
            ...input,
            timestamps: {
              createdAt: '2026-04-19T00:00:00.000Z',
              updatedAt: '2026-04-19T00:00:00.000Z',
            },
          }),
          delete: async (id: string) => {
            deletedSiteIds.push(id);
            return true;
          },
        },
        groups: {
          findAll: async () => [],
          update: async () => null,
        },
        settings: {
          get: async () => ({
            defaultFrappeVersion: '15.0.0',
            runtimePreference: 'docker',
            storagePath: outputDirectory,
            terminalPreference: 'zsh',
            editorPreference: 'code',
            updateChannel: 'stable',
            autoUpdateEnabled: true,
            sidebarCompact: false,
          }),
        },
        appCatalog: {
          findAll: async () => [
            {
              id: 'frappe',
              name: 'Frappe',
              description: 'Core framework',
              source: 'frappe/frappe',
              version: '15.0.0',
              compatibility: { supportedRuntimes: ['docker', 'podman'] },
            },
            {
              id: 'erpnext',
              name: 'ERPNext',
              description: 'ERP app',
              source: 'frappe/erpnext',
              version: '15.0.0',
              compatibility: { supportedRuntimes: ['docker'] },
            },
          ],
        },
      },
      {
        artifactDirectory: exportResult.artifactDirectory,
        benchId: 'target-bench',
        conflictPolicy: 'rename',
      },
      {
        persistImportOperation: async () => {
          throw new Error('simulated log write failure');
        },
      }
    );

    expect(result.success).toBe(false);
    expect(result.createdSiteId).toBeNull();
    expect(deletedSiteIds).toEqual(['new-site']);
    expect(result.steps.some((step) => step.name === 'rollback-site-record' && step.status === 'success')).toBe(true);
  });
});
