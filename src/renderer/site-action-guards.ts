import type { BenchListItem, SiteListItem } from '../shared/ipc';

export const canStartSiteFromUi = (
  site: Pick<SiteListItem, 'status' | 'benchId'>,
  benches: readonly Pick<BenchListItem, 'id' | 'status'>[]
): boolean => {
  if (site.status === 'running') {
    return false;
  }

  const bench = benches.find((entry) => entry.id === site.benchId);
  if (!bench) {
    return false;
  }

  return bench.status === 'running' || bench.status === 'success';
};

export const canStopSiteFromUi = (site: Pick<SiteListItem, 'status'>): boolean => site.status !== 'stopped';
