import { AppSchema, type AppCatalogItem } from '../../shared/domain/models';
import fs from 'node:fs';
import { getBinaryPath } from '../utils/binaries';

export const APP_CATALOG_SEED_VERSION = 14;

type BreweryAppItem = {
  slug: string;
  title: string;
  description: string;
  repository: string;
  install_branches?: Record<string, string>;
  media?: {
    icon?: string;
  };
  categories?: string[];
  frappe_versions?: string[];
  min_frappe_version?: string;
  license?: string;
  meta?: {
    verified?: boolean;
  };
};

type BreweryResponse = {
  apps: BreweryAppItem[];
};

export const normalizeCatalogProviderItem = (item: BreweryAppItem): AppCatalogItem => {
  const supportedBenchVersions = item.frappe_versions
    ? item.frappe_versions.map((v) => {
        const trimmed = v.trim();
        return trimmed === '15' || trimmed === '16' || trimmed === '14' ? `version-${trimmed}` : trimmed;
      })
    : undefined;

  const installBranches: Record<string, string> = {};
  if (item.install_branches) {
    for (const [key, value] of Object.entries(item.install_branches)) {
      const trimmedKey = key.trim();
      const benchVersion = trimmedKey === '15' || trimmedKey === '16' || trimmedKey === '14' ? `version-${trimmedKey}` : trimmedKey;
      installBranches[benchVersion] = value.trim();
    }
  }

  let category = 'other';
  if (item.categories && item.categories.length > 0 && item.categories[0]) {
    const rawCategory = item.categories[0].toLowerCase();
    if (['core', 'business', 'productivity', 'learning', 'tools'].includes(rawCategory)) {
        category = rawCategory;
    } else if (rawCategory === 'customer relations' || rawCategory === 'crm-support') {
        category = 'crm-support';
    } else if (rawCategory === 'utilities') {
        category = 'tools';
    } else {
        category = 'other';
    }
  }

  return AppSchema.parse({
    id: item.slug.trim().toLowerCase(),
    name: item.title.trim(),
    description: item.description?.trim() || 'No description available.',
    source: item.repository.trim(),
    installBranches: Object.keys(installBranches).length > 0 ? installBranches : undefined,
    version: 'latest',
    category: category,
    categories: item.categories || [],
    license: item.license?.trim() || undefined,
    verified: item.meta?.verified || false,
    icon: item.media?.icon?.trim() || undefined,
    compatibility: {
      minimumFrappeVersion: item.min_frappe_version?.trim(),
      supportedBenchVersions: supportedBenchVersions,
    },
  });
};

export const getDefaultAppCatalogSeed = (): AppCatalogItem[] => {
  try {
    const appsJsonPath = getBinaryPath('apps.json');
    if (!fs.existsSync(appsJsonPath)) {
      console.warn('apps.json not found in bin directory at', appsJsonPath);
      return [];
    }
    const appsJsonContent = fs.readFileSync(appsJsonPath, 'utf8');
    const breweryResponse: BreweryResponse = JSON.parse(appsJsonContent);
    return breweryResponse.apps.map(normalizeCatalogProviderItem);
  } catch (error) {
    console.error('Failed to load apps.json catalog seed:', error);
    return [];
  }
};
