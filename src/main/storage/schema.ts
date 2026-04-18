import type { AppCatalogItem, BenchRecord, Group, Settings, Site } from '../../shared/domain/models';

export const CURRENT_STORAGE_SCHEMA_VERSION = 1;

export const DEFAULT_APP_CATALOG_SEED_VERSION = 1;

export type StorageMetadata = {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appCatalogSeedVersion: number;
};

export type StorageSnapshot = {
  readonly schemaVersion: number;
  readonly metadata: StorageMetadata;
  readonly benches: BenchRecord[];
  readonly sites: Site[];
  readonly groups: Group[];
  readonly settings: Settings | null;
  readonly appCatalog: AppCatalogItem[];
};

export const createDefaultStorageSnapshot = (
  appCatalogSeed: AppCatalogItem[],
  appCatalogSeedVersion = DEFAULT_APP_CATALOG_SEED_VERSION
): StorageSnapshot => {
  const timestamp = new Date().toISOString();

  return {
    schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      appCatalogSeedVersion: appCatalogSeedVersion,
    },
    benches: [],
    sites: [],
    groups: [],
    settings: null,
    appCatalog: appCatalogSeed,
  };
};