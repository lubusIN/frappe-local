import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppCatalogItem } from '../../../src/shared/domain/models';
import { JsonStorageAdapter } from '../../../src/main/storage/adapter';
import { initializeStorage } from '../../../src/main/storage/bootstrap';
import type { StorageMigration } from '../../../src/main/storage/migrations';
import { CURRENT_STORAGE_SCHEMA_VERSION } from '../../../src/main/storage/schema';

const temporaryDirectories: string[] = [];

const createTemporaryStorageFilePath = async (): Promise<string> => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'local-bench-bootstrap-'));
  temporaryDirectories.push(temporaryDirectory);
  return path.join(temporaryDirectory, 'storage.json');
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directoryPath) => {
      await fs.rm(directoryPath, { recursive: true, force: true });
    })
  );
});

describe('storage bootstrap', () => {
  it('creates a snapshot on first run with schema metadata and seeded catalog', async () => {
    const storageFilePath = await createTemporaryStorageFilePath();
    const adapter = new JsonStorageAdapter(storageFilePath);

    const seedCatalog: AppCatalogItem[] = [
      {
        id: 'erpnext',
        name: 'ERPNext',
        description: 'ERP for teams',
        source: 'https://github.com/frappe/erpnext',
        version: '15.0.0',
        category: 'business',
        compatibility: {
          minimumFrappeVersion: 'version-15',
          
        },
      },
    ];

    const snapshot = await initializeStorage(adapter, storageFilePath, {
      appCatalogSeed: seedCatalog,
      appCatalogSeedVersion: 1,
    });

    expect(snapshot.schemaVersion).toBe(CURRENT_STORAGE_SCHEMA_VERSION);
    expect(snapshot.metadata.appCatalogSeedVersion).toBe(1);
    expect(snapshot.appCatalog).toHaveLength(1);
    expect(snapshot.appCatalog[0]?.id).toBe('erpnext');
  });

  it('updates catalog seed when newer seed version is provided', async () => {
    const storageFilePath = await createTemporaryStorageFilePath();
    const adapter = new JsonStorageAdapter(storageFilePath);

    const initialSeedCatalog: AppCatalogItem[] = [
      {
        id: 'frappe',
        name: 'Frappe Framework',
        description: 'Initial seed',
        source: 'https://github.com/frappe/frappe',
        version: '15.0.0',
        category: 'core',
        compatibility: {
          
        },
      },
    ];

    const updatedSeedCatalog: AppCatalogItem[] = [
      {
        id: 'payments',
        name: 'Payments',
        description: 'Updated seed',
        source: 'https://github.com/frappe/payments',
        version: '15.1.0',
        category: 'business',
        compatibility: {
          
        },
      },
    ];

    await initializeStorage(adapter, storageFilePath, {
      appCatalogSeed: initialSeedCatalog,
      appCatalogSeedVersion: 1,
    });

    const reseededSnapshot = await initializeStorage(adapter, storageFilePath, {
      appCatalogSeed: updatedSeedCatalog,
      appCatalogSeedVersion: 2,
    });

    expect(reseededSnapshot.metadata.appCatalogSeedVersion).toBe(2);
    expect(reseededSnapshot.appCatalog[0]?.id).toBe('payments');
  });

  it('reconciles interrupted lifecycle statuses on startup', async () => {
    const storageFilePath = await createTemporaryStorageFilePath();
    const adapter = new JsonStorageAdapter(storageFilePath);

    await initializeStorage(adapter, storageFilePath, {
      appCatalogSeed: [],
      appCatalogSeedVersion: 1,
    });

    await adapter.transaction(async (snapshot) => ({
      snapshot: {
        ...snapshot,
        benches: [
          {
            id: 'bench-1',
            name: 'alpha-bench',
            path: '/tmp/alpha-bench',
            frappe_version: '15.0.0',
            status: 'running',
            apps: ['frappe'],
            created_at: new Date('2026-04-10T00:00:00.000Z').toISOString(),
            updated_at: new Date('2026-04-10T00:00:00.000Z').toISOString(),
          },
        ],
        sites: [
          {
            id: 'site-1',
            name: 'alpha.localhost',
            benchId: 'bench-1',
            apps: ['frappe'],
            status: 'queued',
            path: '/tmp/alpha-bench/sites/alpha.localhost',
            timestamps: {
              createdAt: new Date('2026-04-10T00:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-04-10T00:00:00.000Z').toISOString(),
            },
          },
        ],
      },
      result: undefined,
    }));

    const reconciled = await initializeStorage(adapter, storageFilePath, {
      appCatalogSeed: [],
      appCatalogSeedVersion: 1,
    });

    expect(reconciled.benches[0]?.status).toBe('stopped');
    expect(reconciled.sites[0]?.status).toBe('stopped');
  });

  it('migrates a version 1 snapshot to the current schema version during bootstrap', async () => {
    const storageFilePath = await createTemporaryStorageFilePath();
    const adapter = new JsonStorageAdapter(storageFilePath);

    await adapter.connect();
    await fs.writeFile(
      storageFilePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          metadata: {
            createdAt: '2026-04-19T00:00:00.000Z',
            updatedAt: '2026-04-19T00:00:00.000Z',
            appCatalogSeedVersion: 1,
          },
          benches: [],
          sites: [],
          groups: [],
          settings: null,
          appCatalog: [],
        },
        null,
        2
      ),
      'utf8'
    );

    const migratedSnapshot = await initializeStorage(adapter, storageFilePath, {
      appCatalogSeed: [],
      appCatalogSeedVersion: 1,
    });

    expect(migratedSnapshot.schemaVersion).toBe(CURRENT_STORAGE_SCHEMA_VERSION);
    expect(migratedSnapshot.metadata.lastMigratedAt).not.toBeNull();
  });

  it('leaves the stored snapshot unchanged when a migration fails', async () => {
    const storageFilePath = await createTemporaryStorageFilePath();
    const adapter = new JsonStorageAdapter(storageFilePath);

    await adapter.connect();
    const originalContents = JSON.stringify(
      {
        schemaVersion: 1,
        metadata: {
          createdAt: '2026-04-19T00:00:00.000Z',
          updatedAt: '2026-04-19T00:00:00.000Z',
          appCatalogSeedVersion: 1,
        },
        benches: [],
        sites: [],
        groups: [],
        settings: null,
        appCatalog: [],
      },
      null,
      2
    );

    await fs.writeFile(storageFilePath, originalContents, 'utf8');

    const failingMigration: StorageMigration = {
      fromVersion: 1,
      toVersion: 2,
      description: 'Fail intentionally',
      migrate: () => {
        throw new Error('intentional migration failure');
      },
    };

    await expect(
      initializeStorage(adapter, storageFilePath, {
        appCatalogSeed: [],
        appCatalogSeedVersion: 1,
        migrations: [failingMigration],
      })
    ).rejects.toThrow('intentional migration failure');

    expect(await fs.readFile(storageFilePath, 'utf8')).toBe(originalContents);
  });
});