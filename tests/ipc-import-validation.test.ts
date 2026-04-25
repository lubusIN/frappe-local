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

describe('import validation IPC handler', () => {
  it('returns import summary and compatibility issues for a selected bench', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-ipc-'));
    temporaryDirectories.push(outputDirectory);

    const exportResult = await exportSitePackage(
      {
        benches: {
          findById: async (id: string) =>
            id === 'bench-1'
              ? {
                  id: 'bench-1',
                  name: 'Alpha Bench',
                  path: '/Users/example/alpha',
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
            id === 'site-1'
              ? {
                  id: 'site-1',
                  name: 'alpha.localhost',
                  benchId: 'bench-1',
                  groupId: null,
                  apps: ['frappe', 'erpnext'],
                  status: 'running',
                  path: '/Users/example/alpha/sites/alpha.localhost',
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
            {
              id: 'erpnext',
              name: 'ERPNext',
              description: 'ERP app',
              source: 'frappe/erpnext',
              version: '15.0.0',
              category: 'business',
              compatibility: { maximumFrappeVersion: '15.1.0', },
            },
          ],
        },
        storageMetadata: { schemaVersion: 1, appCatalogSeedVersion: 1 },
      },
      { siteId: 'site-1', outputDirectory }
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
            id === 'bench-target'
              ? {
                  id: 'bench-target',
                  name: 'Target Bench',
                  path: '/Users/example/target',
                  frappeVersion: '15.2.0',
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
          findAll: async () => [],
          findById: async () => null,
          create: async () => { throw new Error('not implemented'); },
          update: async () => null,
          delete: async () => false,
        },
        settings: {
          get: async () => ({
            defaultFrappeVersion: '15.0.0',
            runtimePreference: 'docker',
            storagePath: '/Users/example/.frappe-cafe',
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

    const result = await handlers.get(ipcChannels.importValidatePackage)?.(undefined, {
      artifactDirectory: exportResult.artifactDirectory,
      benchId: 'bench-target',
    }) as { canImport: boolean; summary: { siteName: string }; issues: Array<{ code: string; severity: string }> };

    expect(result.canImport).toBe(true);
    expect(result.summary.siteName).toBe('alpha.localhost');
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'frappe-version-warning', severity: 'warning' }),
      expect.objectContaining({ code: 'missing-required-app', severity: 'warning' }),
    ]);
  });
});