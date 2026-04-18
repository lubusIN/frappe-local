import type { Site } from '../shared/domain/models';

/**
 * Normalize tags by lowercasing, trimming whitespace, and removing duplicates
 */
export function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

/**
 * Parse comma-separated tag string into normalized array
 */
export function parseTagsFromText(text: string): string[] {
  const tags = text.split(',').map((tag) => tag.trim());
  return normalizeTags(tags);
}

/**
 * Extract unique tags from a list of sites
 */
export function extractSiteTags(sites: Site[]): string[] {
  const allTags = sites.flatMap((site) => site.groupId ? [] : []);
  return Array.from(new Set(allTags)).sort();
}

/**
 * Filter criteria for site search
 */
export interface SiteFilterCriteria {
  query?: string;
  groupId?: string | null;
  tags?: string[];
  status?: Site['status'];
}

/**
 * Filter and search sites based on criteria
 */
export function filterSites(
  sites: Site[],
  criteria: SiteFilterCriteria,
  groupTagMap?: Map<string, string[]>
): Site[] {
  return sites.filter((site) => {
    // Filter by search query
    if (criteria.query) {
      const query = criteria.query.toLowerCase();
      if (!site.name.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Filter by group
    if (criteria.groupId !== undefined) {
      if (criteria.groupId === null && site.groupId !== null) {
        return false;
      }
      if (criteria.groupId !== null && site.groupId !== criteria.groupId) {
        return false;
      }
    }

    // Filter by status
    if (criteria.status && site.status !== criteria.status) {
      return false;
    }

    // Filter by tags (site must have all selected tags)
    if (criteria.tags && criteria.tags.length > 0 && site.groupId) {
      const siteTags = groupTagMap?.get(site.groupId) || [];
      const hasAllTags = criteria.tags.every((tag) => siteTags.includes(tag));
      if (!hasAllTags) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get available filter options from sites
 */
export function getFilterOptions(sites: Site[], groupTagMap?: Map<string, string[]>) {
  const statuses = Array.from(new Set(sites.map((s) => s.status))).sort();
  const allTags = new Set<string>();

  groupTagMap?.forEach((tags) => {
    tags.forEach((tag) => allTags.add(tag));
  });

  return {
    statuses,
    tags: Array.from(allTags).sort(),
  };
}
