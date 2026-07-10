import { AppSchema, DEFAULT_BREWERY_URL, type AppCatalogItem } from '@frappe-local/shared/domain';
import fs from 'node:fs';
import { getBinaryPath } from '@frappe-local/main/utils';
import { fetchRemoteIconAsDataUrl } from '../../../scripts/utils/icon-fetcher.js';

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

export const fetchBreweryCatalog = async (
  inputUrl?: string
): Promise<{ success: boolean; apps: AppCatalogItem[]; url?: string; error?: string }> => {
  const targetUrl = (inputUrl || DEFAULT_BREWERY_URL).trim();
  const urlsToTry: string[] = [];

  if (targetUrl.endsWith('.json')) {
    urlsToTry.push(targetUrl);
  } else {
    const baseUrl = targetUrl.replace(/\/+$/, '');
    urlsToTry.push(`${baseUrl}/index/apps.json`);
    urlsToTry.push(`${baseUrl}/apps.json`);
    urlsToTry.push(`${baseUrl}`);
  }

  let lastError = 'No URL attempted';

  for (const fetchUrl of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${res.statusText}`;
        continue;
      }

      const json = await res.json();
      const rawApps: BreweryAppItem[] | null = Array.isArray(json)
        ? json
        : (json && typeof json === 'object' && Array.isArray((json as BreweryResponse).apps)
            ? (json as BreweryResponse).apps
            : null);

      if (!rawApps || !Array.isArray(rawApps) || rawApps.length === 0) {
        lastError = 'Invalid catalog JSON format or empty apps list';
        continue;
      }

      const validApps = rawApps
        .filter((app) => app && typeof app === 'object' && app.slug && app.title && app.repository)
        .map(normalizeCatalogProviderItem);

      if (validApps.length === 0) {
        lastError = 'Catalog JSON did not contain any valid app definitions';
        continue;
      }

      return {
        success: true,
        apps: validApps,
        url: fetchUrl,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    success: false,
    apps: [],
    error: lastError,
  };
};

export const cacheCatalogIcons = async (apps: AppCatalogItem[]): Promise<AppCatalogItem[]> => {
  return Promise.all(
    apps.map(async (app) => {
      if (app.icon && (app.icon.startsWith('http://') || app.icon.startsWith('https://'))) {
        const dataUrl = await fetchRemoteIconAsDataUrl(app.icon, 5000);
        if (dataUrl && typeof dataUrl === 'string') {
          return { ...app, icon: dataUrl };
        }
      }
      return app;
    })
  );
};

export const syncAppCatalogFromBrewery = async (
  breweryUrl: string | undefined,
  appCatalogRepo: { sync?: (apps: AppCatalogItem[]) => Promise<void> }
): Promise<{ success: boolean; apps: AppCatalogItem[]; error?: string }> => {
  const primaryResult = await fetchBreweryCatalog(breweryUrl);
  if (primaryResult.success) {
    const cachedApps = await cacheCatalogIcons(primaryResult.apps);
    if (appCatalogRepo.sync) await appCatalogRepo.sync(cachedApps);
    return { ...primaryResult, apps: cachedApps };
  }

  const normalizedInput = (breweryUrl || '').trim().replace(/\/+$/, '');
  const normalizedDefault = DEFAULT_BREWERY_URL.replace(/\/+$/, '');
  const isDefaultUrl = !normalizedInput ||
    normalizedInput === normalizedDefault ||
    normalizedInput === `${normalizedDefault}/index/apps.json` ||
    normalizedInput === `${normalizedDefault}/apps.json` ||
    normalizedInput.includes('frappe-brewery.lubus.in');

  if (!isDefaultUrl) {
    const fallbackResult = await fetchBreweryCatalog(DEFAULT_BREWERY_URL);
    if (fallbackResult.success) {
      const cachedApps = await cacheCatalogIcons(fallbackResult.apps);
      if (appCatalogRepo.sync) await appCatalogRepo.sync(cachedApps);
      return { ...fallbackResult, apps: cachedApps };
    }
  }

  return {
    success: false,
    apps: [],
    error: primaryResult.error || 'Failed to fetch catalog',
  };
};

