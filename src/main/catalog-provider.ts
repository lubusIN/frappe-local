import { AppSchema, type AppCatalogItem } from '../shared/domain/models';
import defaultCatalog from './default-catalog.json';

export const APP_CATALOG_SEED_VERSION = 11;

type RawCatalogProviderItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly installBranch?: string;
  readonly installBranches?: Readonly<Record<string, string>>;
  readonly version: string;
  readonly category: string;
  readonly icon?: string;
  readonly compatibility?: {
    readonly minimumFrappeVersion?: string;
    readonly maximumFrappeVersion?: string;
    readonly supportedBenchVersions?: readonly string[];
  };
};

export const normalizeCatalogProviderItem = (item: RawCatalogProviderItem): AppCatalogItem => {
  return AppSchema.parse({
    id: item.id.trim().toLowerCase(),
    name: item.name.trim(),
    description: item.description.trim(),
    source: item.source.trim(),
    installBranch: item.installBranch?.trim() || undefined,
    installBranches: item.installBranches
      ? Object.fromEntries(
          Object.entries(item.installBranches)
            .map(([key, value]) => [key.trim().toLowerCase(), value.trim()])
            .filter(([, value]) => Boolean(value))
        )
      : undefined,
    version: item.version.trim(),
    category: item.category.trim(),
    icon: item.icon?.trim() || undefined,
    compatibility: {
      minimumFrappeVersion: item.compatibility?.minimumFrappeVersion?.trim(),
      maximumFrappeVersion: item.compatibility?.maximumFrappeVersion?.trim(),
      supportedBenchVersions: item.compatibility?.supportedBenchVersions?.map((version) => version.trim()).filter(Boolean),
    },
  });
};

export const getDefaultAppCatalogSeed = (): AppCatalogItem[] =>
  (defaultCatalog as RawCatalogProviderItem[]).map(normalizeCatalogProviderItem);
