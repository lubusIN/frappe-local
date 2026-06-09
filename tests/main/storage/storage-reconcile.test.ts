import { describe, expect, it } from 'vitest';
import { reconcileLifecycleSnapshot } from '../../../src/main/storage/reconcile';
import type { StorageSnapshot } from '../../../src/main/storage/schema';

const makeSnapshot = (): StorageSnapshot => ({
  schemaVersion: 2,
  metadata: {
    createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
    appCatalogSeedVersion: 1,
    lastMigratedAt: null,
  },
  benches: [
    {
      id: 'bench-1',
      name: 'alpha-bench',
      path: '/tmp/alpha-bench',
      frappe_version: '15.0.0',
      status: 'queued',
      apps: ['frappe'],
      created_at: new Date('2026-04-01T00:00:00.000Z').toISOString(),
      updated_at: new Date('2026-04-01T00:00:00.000Z').toISOString(),
    },
    {
      id: 'bench-2',
      name: 'beta-bench',
      path: '/tmp/beta-bench',
      frappe_version: '15.0.0',
      status: 'success',
      apps: ['frappe'],
      created_at: new Date('2026-04-01T00:00:00.000Z').toISOString(),
      updated_at: new Date('2026-04-01T00:00:00.000Z').toISOString(),
    },
  ],
  sites: [
    {
      id: 'site-1',
      name: 'alpha.localhost',
      benchId: 'bench-1',
      apps: ['frappe'],
      status: 'queued',
      path: '/tmp/alpha-bench/sites/alpha.localhost',
      timestamps: {
        createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
      },
    },
  ],
  settings: null,
  appCatalog: [],
});

describe('storage reconcile', () => {
  it('reconciles interrupted bench and site states to failure', () => {
    const snapshot = makeSnapshot();

    const result = reconcileLifecycleSnapshot(snapshot);

    expect(result.wasChanged).toBe(true);
    expect(result.reconciledBenches).toBe(1);
    expect(result.reconciledSites).toBe(1);
    expect(result.snapshot.benches[0]?.status).toBe('failure');
    expect(result.snapshot.sites[0]?.status).toBe('failure');
    expect(result.snapshot.benches[1]?.status).toBe('success');
  });

  it('returns unchanged snapshot when no interrupted states exist', () => {
    const snapshot = makeSnapshot();
    snapshot.benches[0] = {
      ...snapshot.benches[0]!,
      status: 'stopped',
    };
    snapshot.sites[0] = {
      ...snapshot.sites[0]!,
      status: 'stopped',
    };

    const result = reconcileLifecycleSnapshot(snapshot);

    expect(result.wasChanged).toBe(false);
    expect(result.snapshot).toBe(snapshot);
  });
});
