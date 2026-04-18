import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppCatalogItem } from '../src/shared/domain/models';
import { JsonStorageAdapter } from '../src/main/storage/adapter';
import { initializeStorage } from '../src/main/storage/bootstrap';
import { CURRENT_STORAGE_SCHEMA_VERSION } from '../src/main/storage/schema';

const temporaryDirectories: string[] = [];

const createTemporaryStorageFilePath = async (): Promise<string> => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-bootstrap-'));
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
        compatibility: {
          minimumFrappeVersion: 'version-15',
          supportedRuntimes: ['docker', 'podman'],
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
        compatibility: {
          supportedRuntimes: ['docker', 'podman'],
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
        compatibility: {
          supportedRuntimes: ['docker', 'podman'],
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
});