import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportSitePackage } from '../src/main/export-package-writer';
import {
  parseImportPackage,
  validateImportCompatibility,
} from '../src/main/import-package-validator';

const temporaryDirectories: string[] = [];

const createExportFixture = async (outputDirectory: string) => {
  return exportSitePackage(
    {
      benches: {
        findById: async (id: string) =>
          id === 'bench-1'
            ? {
                id: 'bench-1',
                name: 'Alpha Bench',
                path: '/Users/example/alpha',
                frappeVersion: '15.0.0',
                runtime: 'podman',
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
                groupId: null,
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
      groups: { findAll: async () => [] },
      settings: {
        get: async () => ({
          defaultFrappeVersion: '15.0.0',
          storagePath: '/Users/example/.frappe-cafe',
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
            category: 'core',
            compatibility: {
              minimumFrappeVersion: '15.0.0',
              
            },
          },
          {
            id: 'erpnext',
            name: 'ERPNext',
            description: 'ERP app',
            source: 'frappe/erpnext',
            version: '15.0.0',
            category: 'business',
            compatibility: {
              minimumFrappeVersion: '15.0.0',
              maximumFrappeVersion: '15.1.0',
              
            },
          },
          {
            id: 'payments',
            name: 'Payments',
            description: 'Payments app',
            source: 'frappe/payments',
            version: '15.0.0',
            category: 'business',
            compatibility: {
              
            },
          },
        ],
      },
      storageMetadata: {
        schemaVersion: 1,
        appCatalogSeedVersion: 2,
      },
    },
    {
      siteId: 'site-1',
      outputDirectory,
    }
  );
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('import package parser', () => {
  it('parses a valid export artifact and verifies checksum metadata', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await createExportFixture(outputDirectory);

    const parsedPackage = await parseImportPackage(exportResult.artifactDirectory);

    expect(parsedPackage.manifest.site.id).toBe('site-1');
    expect(parsedPackage.payload.data.bench.id).toBe('bench-1');
  });

  it('rejects tampered payload checksums', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await createExportFixture(outputDirectory);

    await writeFile(exportResult.payloadPath, '{"tampered":true}\n', 'utf8');

    await expect(parseImportPackage(exportResult.artifactDirectory)).rejects.toThrow(
      'Import package checksum verification failed for payload.json.'
    );
  });

  it('rejects invalid manifest content', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await createExportFixture(outputDirectory);

    const manifest = JSON.parse(await readFile(exportResult.manifestPath, 'utf8')) as Record<string, unknown>;
    delete manifest.packageVersion;
    await writeFile(exportResult.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    await expect(parseImportPackage(exportResult.artifactDirectory)).rejects.toThrow();
  });
});

describe('import package compatibility validation', () => {
  it('blocks import when runtime or Frappe version is incompatible', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await createExportFixture(outputDirectory);
    const parsedPackage = await parseImportPackage(exportResult.artifactDirectory);

    const result = validateImportCompatibility(parsedPackage, {
      targetRuntime: 'podman',
      targetFrappeVersion: '14.99.0',
      availableAppIds: ['frappe'],
    });

    expect(result.canImport).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'runtime-incompatible' && issue.severity === 'error')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'frappe-version-too-low' && issue.severity === 'error')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'missing-required-app' && issue.severity === 'warning')).toBe(true);
  });

  it('keeps compatibility warnings distinct from hard failures', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-import-'));
    temporaryDirectories.push(outputDirectory);
    const exportResult = await createExportFixture(outputDirectory);
    const parsedPackage = await parseImportPackage(exportResult.artifactDirectory);

    const result = validateImportCompatibility(parsedPackage, {
      targetRuntime: 'podman',
      targetFrappeVersion: '15.2.0',
      availableAppIds: ['frappe', 'erpnext', 'payments'],
    });

    expect(result.canImport).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'frappe-version-warning',
        severity: 'warning',
      }),
    ]);
  });
});