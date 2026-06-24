import type { SiteListItem } from '@frappe-local/shared/core';

export type SiteFilterInput = {
  readonly benchId: string;
  readonly status: string;
  readonly search: string;
};

export const filterSites = (sites: readonly SiteListItem[], filters: SiteFilterInput): SiteListItem[] => {
  const benchId = filters.benchId.trim();
  const status = filters.status.trim();
  const search = filters.search.trim().toLowerCase();

  return sites.filter((site) => {
    if (benchId && site.benchId !== benchId) {
      return false;
    }

    if (status && site.status !== status) {
      return false;
    }

    if (search) {
      const haystack = `${site.name} ${site.path} ${site.benchId}`.toLowerCase();
      return haystack.includes(search);
    }

    return true;
  });
};
