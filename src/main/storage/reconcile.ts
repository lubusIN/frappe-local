import type { StorageSnapshot } from './schema';

const isInterruptedStatus = (status: 'queued' | 'running' | 'stopped' | 'success' | 'failure'): boolean =>
  status === 'queued' || status === 'running';

export type ReconcileLifecycleResult = {
  readonly snapshot: StorageSnapshot;
  readonly wasChanged: boolean;
  readonly reconciledBenches: number;
  readonly reconciledSites: number;
};

export const reconcileLifecycleSnapshot = (snapshot: StorageSnapshot): ReconcileLifecycleResult => {
  const now = new Date().toISOString();
  let reconciledBenches = 0;
  let reconciledSites = 0;

  const benches = snapshot.benches.map((bench) => {
    if (!isInterruptedStatus(bench.status)) {
      return bench;
    }

    reconciledBenches += 1;
    return {
      ...bench,
      status: 'stopped' as const,
      updated_at: now,
    };
  });

  const sites = snapshot.sites.map((site) => {
    if (!isInterruptedStatus(site.status)) {
      return site;
    }

    reconciledSites += 1;
    return {
      ...site,
      status: 'stopped' as const,
      timestamps: {
        ...site.timestamps,
        updatedAt: now,
      },
    };
  });

  if (reconciledBenches === 0 && reconciledSites === 0) {
    return {
      snapshot,
      wasChanged: false,
      reconciledBenches,
      reconciledSites,
    };
  }

  return {
    snapshot: {
      ...snapshot,
      benches,
      sites,
      metadata: {
        ...snapshot.metadata,
        updatedAt: now,
      },
    },
    wasChanged: true,
    reconciledBenches,
    reconciledSites,
  };
};