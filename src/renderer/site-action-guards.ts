import type { BenchListItem, SiteListItem } from '../shared/ipc';

/**
 * Check if a bench can be started from the UI
 * Benches can be started if they are stopped or in a failure state
 */
export const canStartBenchFromUi = (
  bench: Pick<BenchListItem, 'status'>
): boolean => {
  return bench.status === 'stopped' || bench.status === 'failure';
};

/**
 * Check if a bench can be stopped from the UI
 * Benches can be stopped if they are running or in success state
 */
export const canStopBenchFromUi = (
  bench: Pick<BenchListItem, 'status'>
): boolean => {
  return bench.status === 'running' || bench.status === 'success';
};

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
