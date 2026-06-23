import { describe, expect, it, vi } from 'vitest';

const orchestrateSiteStatusUpdateMock = vi.fn();

vi.mock('../../../src/main/services/site-orchestration', () => ({
  orchestrateSiteCreation: vi.fn(),
  orchestrateSiteDeletion: vi.fn(),
  orchestrateSiteStatusUpdate: (...args: unknown[]) => orchestrateSiteStatusUpdateMock(...args),
}));

import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { Settings, Site } from '../../../src/shared/domain/models';

describe('sites:update queued guard', () => {
  it('does not enqueue a duplicate status operation when site is already queued', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown> | unknown>();

    const queuedSite: Site = {
      id: 'site-queued',
      name: 'frappevault.localhost',
      benchId: 'bench-001',
      apps: ['frappe'],
      status: 'queued',
      path: '/Users/dev/frappe-bench/sites/frappevault.localhost',
      timestamps: {
        createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
      },
    };

    const benches = [
      {
        id: 'bench-001',
        name: 'bench-1',
        path: '/Users/dev/frappe-bench',
        frappeVersion: '15.0.0',
        status: 'running' as const,
        apps: ['frappe'],
        timestamps: {
          createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        },
      },
    ];

    let currentSite = queuedSite;

    const repositories = {
      appCatalog: {
        findAll: async () => [],
      },
      benches: {
        findAll: async () => benches,
        findById: async (id: string) => benches.find((bench) => bench.id === id) ?? null,
        create: async () => benches[0]!,
        update: async () => benches[0]!,
        delete: async () => true,
      },
      sites: {
        findAll: async () => [currentSite],
        findById: async (id: string) => (currentSite.id === id ? currentSite : null),
        create: async () => currentSite,
        update: async (_id: string, input: Partial<Site>) => {
          currentSite = {
            ...currentSite,
            ...input,
            timestamps: {
              ...currentSite.timestamps,
              updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
            },
          };
          return currentSite;
        },
        delete: async () => true,
      },
      settings: {
        get: async () => null as Settings | null,
        set: async (input: Partial<Settings>) => input as Settings,
      },
      customApps: {
        findAll: async () => [],
        findById: async () => null,
        create: async () => ({} as any),
        update: async () => null,
        delete: async () => false,
      },
    };

    registerIpcHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      repositories
    );

    const updateHandler = handlers.get(ipcChannels.sitesUpdate);
    const result = await updateHandler?.(undefined, 'site-queued', { status: 'ready' });

    expect(result).toMatchObject({
      id: 'site-queued',
      status: 'queued',
    });
    expect(orchestrateSiteStatusUpdateMock).not.toHaveBeenCalled();
  });
});
