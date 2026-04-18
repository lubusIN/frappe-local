import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSha256,
  ExportPackageManifestSchema,
  ExportPackagePayloadSchema,
} from '../src/shared/domain/export-package';
import { exportSitePackage } from '../src/main/export-package-writer';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('export package schema', () => {
  it('validates a manifest with payload checksum metadata', () => {
    const payloadContents = JSON.stringify({ hello: 'world' });
    const manifest = {
      packageVersion: 1,
      exportedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
      site: {
        id: 'site-1',
        name: 'alpha.localhost',
        benchId: 'bench-1',
        groupId: null,
        apps: ['frappe'],
        status: 'running',
        path: '/Users/example/alpha/sites/alpha.localhost',
        timestamps: {
          createdAt: new Date('2026-04-18T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
        },
      },
      bench: {
        id: 'bench-1',
        name: 'Alpha Bench',
        path: '/Users/example/alpha',
        frappeVersion: '15.0.0',
        runtime: 'docker',
        status: 'running',
        apps: ['frappe'],
        timestamps: {
          createdAt: new Date('2026-04-18T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
        },
      },
      group: null,
      settings: null,
      requiredApps: [],
      payload: {
        fileName: 'payload.json',
        sha256: createSha256(payloadContents),
        sizeBytes: Buffer.byteLength(payloadContents, 'utf8'),
      },
      metadata: {
        storageSchemaVersion: 1,
        appCatalogSeedVersion: 1,
        exportedBy: 'Frappe Cafe',
      },
    };

    expect(() => ExportPackageManifestSchema.parse(manifest)).not.toThrow();
  });
});

describe('export site package writer', () => {
  it('creates a versioned artifact directory with manifest and payload', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-export-'));
    temporaryDirectories.push(outputDirectory);

    const result = await exportSitePackage(
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
                  apps: ['frappe', 'payments'],
                  timestamps: {
                    createdAt: new Date('2026-04-18T00:00:00.000Z').toISOString(),
                    updatedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
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
                  groupId: 'group-1',
                  apps: ['frappe', 'erpnext'],
                  status: 'running',
                  path: '/Users/example/alpha/sites/alpha.localhost',
                  timestamps: {
                    createdAt: new Date('2026-04-18T00:00:00.000Z').toISOString(),
                    updatedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
                  },
                }
              : null,
        },
        groups: {
          findAll: async () => [
            {
              id: 'group-1',
              name: 'Alpha Workspace',
              description: 'Primary customer workspace',
              tags: ['priority'],
              siteIds: ['site-1'],
            },
          ],
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
              compatibility: {
                supportedRuntimes: ['docker', 'podman'],
              },
            },
            {
              id: 'erpnext',
              name: 'ERPNext',
              description: 'ERP app',
              source: 'frappe/erpnext',
              version: '15.0.0',
              compatibility: {
                supportedRuntimes: ['docker'],
              },
            },
            {
              id: 'payments',
              name: 'Payments',
              description: 'Payments app',
              source: 'frappe/payments',
              version: '15.0.0',
              compatibility: {
                supportedRuntimes: ['docker'],
              },
            },
          ],
        },
        storageMetadata: {
          schemaVersion: 1,
          appCatalogSeedVersion: 3,
        },
      },
      {
        siteId: 'site-1',
        outputDirectory,
      }
    );

    const manifestContents = await readFile(result.manifestPath, 'utf8');
    const payloadContents = await readFile(result.payloadPath, 'utf8');

    const manifest = ExportPackageManifestSchema.parse(JSON.parse(manifestContents));
    const payload = ExportPackagePayloadSchema.parse(JSON.parse(payloadContents));

    expect(result.artifactDirectory).toContain('alpha-localhost-export-v1');
    expect(manifest.payload.sha256).toBe(createSha256(payloadContents));
    expect(manifest.payload.sizeBytes).toBe(Buffer.byteLength(payloadContents, 'utf8'));
    expect(payload.data.site.id).toBe('site-1');
    expect(payload.data.bench.id).toBe('bench-1');
    expect(payload.data.group?.id).toBe('group-1');
    expect(payload.data.requiredApps.map((app) => app.id).sort()).toEqual(['erpnext', 'frappe', 'payments']);
  });

  it('fails when the site cannot be found', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-export-'));
    temporaryDirectories.push(outputDirectory);

    await expect(
      exportSitePackage(
        {
          benches: { findById: async () => null },
          sites: { findById: async () => null },
          groups: { findAll: async () => [] },
          settings: { get: async () => null },
          appCatalog: { findAll: async () => [] },
          storageMetadata: {
            schemaVersion: 1,
            appCatalogSeedVersion: 1,
          },
        },
        {
          siteId: 'missing-site',
          outputDirectory,
        }
      )
    ).rejects.toThrow('Cannot export site: site was not found.');
  });
});