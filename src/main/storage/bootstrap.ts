import fs from 'node:fs/promises';
import type { AppCatalogItem } from '@frappe-local/shared/domain';
import { createMainLogger } from '@frappe-local/main/logger';
import type { StorageAdapter } from '@frappe-local/main/storage';
import { CURRENT_STORAGE_SCHEMA_VERSION, createDefaultStorageSnapshot, reconcileLifecycleSnapshot, runStorageMigrations, storageMigrations, type StorageMigration, type StorageSnapshot } from '@frappe-local/main/storage';

type InitializeStorageOptions = {
  readonly appCatalogSeed: AppCatalogItem[];
  readonly appCatalogSeedVersion: number;
  readonly migrations?: readonly StorageMigration[];
};

const storageLogger = createMainLogger('storage');

export const applyAppCatalogSeed = (
  snapshot: StorageSnapshot,
  appCatalogSeed: AppCatalogItem[],
  appCatalogSeedVersion: number
): StorageSnapshot => {
  if (snapshot.metadata.appCatalogSeedVersion >= appCatalogSeedVersion) {
    return snapshot;
  }

  const now = new Date().toISOString();

  return {
    ...snapshot,
    appCatalog: appCatalogSeed,
    metadata: {
      ...snapshot.metadata,
      appCatalogSeedVersion,
      updatedAt: now,
    },
  };
};

export const initializeStorage = async (
  adapter: StorageAdapter,
  storageFilePath: string,
  options: InitializeStorageOptions
): Promise<StorageSnapshot> => {
  await adapter.connect();

  let snapshot: StorageSnapshot;

  try {
    await fs.access(storageFilePath);
    snapshot = await adapter.readSnapshot();
    storageLogger.info(`loaded existing storage snapshot from ${storageFilePath}`);
  } catch {
    snapshot = createDefaultStorageSnapshot(options.appCatalogSeed, options.appCatalogSeedVersion);
    await adapter.writeSnapshot(snapshot);
    storageLogger.info(`created new storage snapshot at ${storageFilePath}`);
  }

  if (snapshot.schemaVersion > CURRENT_STORAGE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported storage schema version ${snapshot.schemaVersion}. Expected ${CURRENT_STORAGE_SCHEMA_VERSION}.`
    );
  }

  if (snapshot.schemaVersion < CURRENT_STORAGE_SCHEMA_VERSION) {
    snapshot = runStorageMigrations(snapshot, CURRENT_STORAGE_SCHEMA_VERSION, options.migrations ?? storageMigrations);
    await adapter.writeSnapshot(snapshot);
    storageLogger.info(`migrated storage snapshot to schema version ${CURRENT_STORAGE_SCHEMA_VERSION}`);
  }

  const seededSnapshot = applyAppCatalogSeed(snapshot, options.appCatalogSeed, options.appCatalogSeedVersion);

  if (seededSnapshot !== snapshot) {
    await adapter.writeSnapshot(seededSnapshot);
    storageLogger.info(`updated app catalog seed to version ${options.appCatalogSeedVersion}`);
  }

  const reconciliation = reconcileLifecycleSnapshot(seededSnapshot);
  if (reconciliation.wasChanged) {
    await adapter.writeSnapshot(reconciliation.snapshot);
    storageLogger.info(
      `reconciled interrupted lifecycle states (benches=${reconciliation.reconciledBenches}, sites=${reconciliation.reconciledSites})`
    );
  }

  return reconciliation.snapshot;
};