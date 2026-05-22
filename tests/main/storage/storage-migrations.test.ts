import { describe, expect, it } from 'vitest';
import { runStorageMigrations, type StorageMigration } from '../../../src/main/storage/migrations';

describe('storage migrations', () => {
  it('migrates a version 1 snapshot to version 2', () => {
    const migrated = runStorageMigrations(
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
      2,
      undefined,
      { now: () => '2026-04-19T08:00:00.000Z' }
    );

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.metadata.lastMigratedAt).toBe('2026-04-19T08:00:00.000Z');
    expect(migrated.metadata.updatedAt).toBe('2026-04-19T08:00:00.000Z');
  });

  it('throws when a migration step is missing', () => {
    expect(() =>
      runStorageMigrations(
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
        3,
        []
      )
    ).toThrow('No storage migration found');
  });

  it('propagates migration failures without mutating the source snapshot reference', () => {
    const originalSnapshot = {
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
    };

    const failingMigration: StorageMigration = {
      fromVersion: 1,
      toVersion: 2,
      description: 'Fail intentionally',
      migrate: () => {
        throw new Error('migration failed');
      },
    };

    expect(() => runStorageMigrations(originalSnapshot, 2, [failingMigration])).toThrow('migration failed');
    expect(originalSnapshot.schemaVersion).toBe(1);
    expect((originalSnapshot.metadata as { lastMigratedAt?: string }).lastMigratedAt).toBeUndefined();
  });
});