import type { AppCatalogItem, BenchRecord, Group, Settings, Site } from '../../shared/domain/models';
import type { StorageMetadata, StorageSnapshot } from './schema';

export type LegacyStorageMetadataV1 = {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appCatalogSeedVersion: number;
};

export type LegacyStorageSnapshotV1 = {
  readonly schemaVersion: 1;
  readonly metadata: LegacyStorageMetadataV1;
  readonly benches: BenchRecord[];
  readonly sites: Site[];
  readonly groups: Group[];
  readonly settings: Settings | null;
  readonly appCatalog: AppCatalogItem[];
};

export type StorageMigrationContext = {
  readonly now: () => string;
};

export type StorageMigration = {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
  readonly migrate: (snapshot: unknown, context: StorageMigrationContext) => StorageSnapshot;
};

const addMigrationTrackingMetadata = (
  metadata: LegacyStorageMetadataV1,
  migratedAt: string
): StorageMetadata => ({
  ...metadata,
  updatedAt: migratedAt,
  lastMigratedAt: migratedAt,
});

export const storageMigrations: readonly StorageMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    description: 'Add migration tracking metadata to storage snapshots',
    migrate: (snapshot, context) => {
      const source = snapshot as LegacyStorageSnapshotV1;
      const migratedAt = context.now();

      return {
        ...source,
        schemaVersion: 2,
        metadata: addMigrationTrackingMetadata(source.metadata, migratedAt),
      };
    },
  },
];

export const runStorageMigrations = (
  snapshot: unknown,
  targetVersion: number,
  migrations: readonly StorageMigration[] = storageMigrations,
  context: StorageMigrationContext = { now: () => new Date().toISOString() }
): StorageSnapshot => {
  let currentSnapshot = snapshot as { schemaVersion: number };

  while (currentSnapshot.schemaVersion < targetVersion) {
    const migration = migrations.find((entry) => entry.fromVersion === currentSnapshot.schemaVersion);
    if (!migration) {
      throw new Error(`No storage migration found from version ${currentSnapshot.schemaVersion} to ${targetVersion}.`);
    }

    currentSnapshot = migration.migrate(currentSnapshot, context);
  }

  return currentSnapshot as StorageSnapshot;
};