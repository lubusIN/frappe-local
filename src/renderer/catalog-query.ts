import type { CatalogAppItem } from '../shared/ipc';

export type CatalogSort = 'name-asc' | 'name-desc' | 'version-desc';

export type CatalogFilters = {
  readonly query: string;
  readonly sourceHost: string;
  readonly sort: CatalogSort;
};

const sourceHostFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

export const filterAndSortCatalog = (
  items: readonly CatalogAppItem[],
  filters: CatalogFilters
): CatalogAppItem[] => {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const normalizedSourceHost = filters.sourceHost.trim().toLowerCase();

  const filtered = items.filter((item) => {
    const matchesQuery =
      !normalizedQuery ||
      `${item.name} ${item.description} ${item.id}`.toLowerCase().includes(normalizedQuery);

    if (!matchesQuery) {
      return false;
    }

    if (!normalizedSourceHost) {
      return true;
    }

    return sourceHostFromUrl(item.source).toLowerCase() === normalizedSourceHost;
  });

  const sorted = [...filtered];
  if (filters.sort === 'name-asc') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (filters.sort === 'name-desc') {
    sorted.sort((a, b) => b.name.localeCompare(a.name));
  } else {
    sorted.sort((a, b) => b.version.localeCompare(a.version));
  }

  return sorted;
};

export const getCatalogSourceHosts = (items: readonly CatalogAppItem[]): string[] => {
  const hosts = items
    .map((item) => sourceHostFromUrl(item.source))
    .filter(Boolean)
    .map((host) => host.toLowerCase());

  return Array.from(new Set(hosts)).sort((a, b) => a.localeCompare(b));
};
