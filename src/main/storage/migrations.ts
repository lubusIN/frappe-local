import type { StorageSnapshot } from '@frappe-local/main/storage';

export type StorageMigrationContext = {
  readonly now: () => string;
};

export type StorageMigration = {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
  readonly migrate: (snapshot: unknown, context: StorageMigrationContext) => StorageSnapshot;
};

export const storageMigrations: readonly StorageMigration[] = [];

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
