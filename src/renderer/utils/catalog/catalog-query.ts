import type { CatalogAppItem } from '../../../shared/core/ipc';

export type CatalogSort = 'name-asc' | 'name-desc' | 'version-desc';

export type CatalogFilters = {
  readonly query: string;
  readonly sourceHost: string;
  readonly category: string;
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
  const normalizedCategory = filters.category.trim().toLowerCase();

  const filtered = items.filter((item) => {
    const matchesQuery =
      !normalizedQuery ||
      `${item.name} ${item.description} ${item.id}`.toLowerCase().includes(normalizedQuery);

    if (!matchesQuery) {
      return false;
    }

    if (normalizedCategory && (item.category ?? 'other').toLowerCase() !== normalizedCategory) {
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

export type CategoryInfo = {
  readonly id: string;
  readonly label: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core Framework',
  business: 'Business & ERP',
  'crm-support': 'CRM & Support',
  productivity: 'Productivity & Collaboration',
  learning: 'Learning',
  tools: 'Tools & Utilities',
  other: 'Other',
};

export const getCatalogCategories = (items: readonly CatalogAppItem[]): CategoryInfo[] => {
  const seen = new Set<string>();
  const categories: CategoryInfo[] = [];

  // Maintain a specific ordering
  const order = ['core', 'business', 'crm-support', 'productivity', 'learning', 'tools', 'other'];

  for (const key of order) {
    if (items.some((item) => (item.category ?? 'other') === key)) {
      seen.add(key);
      categories.push({
        id: key,
        label: CATEGORY_LABELS[key] ?? key,
      });
    }
  }

  // Any remaining categories not in the predefined list
  for (const item of items) {
    const cat = item.category ?? 'other';
    if (!seen.has(cat)) {
      seen.add(cat);
      categories.push({
        id: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
      });
    }
  }

  return categories;
};

/**
 * Group items by category, preserving a deterministic ordering of groups.
 */
export const groupCatalogByCategory = (
  items: readonly CatalogAppItem[]
): Array<{ category: CategoryInfo; items: CatalogAppItem[] }> => {
  const categories = getCatalogCategories(items);
  const grouped: Array<{ category: CategoryInfo; items: CatalogAppItem[] }> = [];

  for (const cat of categories) {
    const group = items.filter((item) => (item.category ?? 'other') === cat.id);
    if (group.length > 0) {
      grouped.push({ category: cat, items: group });
    }
  }

  return grouped;
};
