import { AppSchema, type AppCatalogItem } from '../shared/domain/models';
import defaultCatalog from './default-catalog.json';

type RawCatalogProviderItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly version: string;
  readonly category: string;
  readonly icon?: string;
  readonly compatibility?: {
    readonly minimumFrappeVersion?: string;
    readonly maximumFrappeVersion?: string;
  };
};

export const normalizeCatalogProviderItem = (item: RawCatalogProviderItem): AppCatalogItem => {
  return AppSchema.parse({
    id: item.id.trim().toLowerCase(),
    name: item.name.trim(),
    description: item.description.trim(),
    source: item.source.trim(),
    version: item.version.trim(),
    category: item.category.trim(),
    icon: item.icon?.trim() || undefined,
    compatibility: {
      minimumFrappeVersion: item.compatibility?.minimumFrappeVersion?.trim(),
      maximumFrappeVersion: item.compatibility?.maximumFrappeVersion?.trim(),
    },
  });
};

export const getDefaultAppCatalogSeed = (): AppCatalogItem[] =>
  (defaultCatalog as RawCatalogProviderItem[]).map(normalizeCatalogProviderItem);
