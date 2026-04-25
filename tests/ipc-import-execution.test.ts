import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportSitePackage } from '../src/main/export-package-writer';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('import execution IPC handler', () => {
  it('executes import with rename policy and returns execution steps', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-ipc-exec-'));
    temporaryDirectories.push(outputDirectory);

    const exportResult = await exportSitePackage(
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
                  apps: ['frappe'],
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
                  apps: ['frappe'],
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
        settings: { get: async () => null },
        appCatalog: {
          findAll: async () => [
            {
              id: 'frappe',
              name: 'Frappe',
              description: 'Core framework',
              source: 'frappe/frappe',
              version: '15.0.0',
              category: 'core',
              compatibility: {},
            },
          ],
        },
        storageMetadata: { schemaVersion: 1, appCatalogSeedVersion: 1 },
      },
      {
        siteId: 'source-site',
        outputDirectory,
      }
    );

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();
    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        appCatalog: {
          findAll: async () => [
            {
              id: 'frappe',
              name: 'Frappe',
              description: 'Core framework',
              source: 'frappe/frappe',
              version: '15.0.0',
              category: 'core',
              compatibility: {},
            },
          ],
          findById: async () => null,
          search: async () => [],
        },
        benches: {
          findAll: async () => [],
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
          create: async () => { throw new Error('not implemented'); },
          update: async () => null,
          delete: async () => false,
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
          findById: async () => null,
          create: async (input: {
            name: string;
            benchId: string;
            groupId: string | null;
            apps: string[];
            status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
            path: string;
          }) => ({
            id: 'imported-site',
            ...input,
            timestamps: {
              createdAt: '2026-04-19T00:00:00.000Z',
              updatedAt: '2026-04-19T00:00:00.000Z',
            },
          }),
          update: async () => null,
          delete: async () => false,
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
          set: async (input) => input,
        },
        groups: {
          findAll: async () => [],
          create: async () => ({ id: 'group-1', name: 'group', description: '', tags: [], siteIds: [] }),
          update: async () => null,
          delete: async () => false,
        },
      }
    );

    const result = await handlers.get(ipcChannels.importExecutePackage)?.(undefined, {
      artifactDirectory: exportResult.artifactDirectory,
      benchId: 'target-bench',
      conflictPolicy: 'rename',
    }) as { success: boolean; siteName: string; createdSiteId: string | null; steps: Array<{ name: string; status: string }> };

    expect(result.success).toBe(true);
    expect(result.createdSiteId).toBe('imported-site');
    expect(result.siteName).toContain('alpha.localhost-import-');
    expect(result.steps.some((step) => step.name === 'conflict-policy' && step.status === 'warning')).toBe(true);
  });
});
