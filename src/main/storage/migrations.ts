import type { AppCatalogItem, BenchRecord, Settings, Site } from '../../shared/domain/models';
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
  readonly sites: any[]; // Use any because Site model changed (groupId removed)
  readonly groups: any[];
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
    description: 'Add migration tracking metadata to storage snapshots and decommission groups',
    migrate: (snapshot, context) => {
      const source = snapshot as LegacyStorageSnapshotV1;
      const migratedAt = context.now();

      // Clean up sites to remove groupId
      const migratedSites: Site[] = source.sites.map((site) => {
        const { groupId: _, ...rest } = site;
        return rest as Site;
      });

      return {
        schemaVersion: 2,
        metadata: addMigrationTrackingMetadata(source.metadata, migratedAt),
        benches: source.benches,
        sites: migratedSites,
        settings: source.settings,
        appCatalog: source.appCatalog,
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

    currentSnapshot = migration.migrate(currentSnapshot, context) as any;
  }

  return currentSnapshot as StorageSnapshot;
};