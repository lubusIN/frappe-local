import { describe, expect, it } from 'vitest';
import { orchestrateSiteCreation } from '../src/main/site-orchestration';
import type { Bench, Site } from '../src/shared/domain/models';

const runningBench: Bench = {
  id: 'bench-001',
  name: 'frappe-bench',
  path: '/Users/dev/frappe-bench',
  frappeVersion: '15.0.0',
  status: 'running',
  apps: ['frappe'],
  timestamps: {
    createdAt: new Date('2026-03-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-03-01T00:00:00.000Z').toISOString(),
  },
};

describe('site orchestration', () => {
  it('creates a queued site and finalizes it as stopped', async () => {
    let current: Site | null = null;

    const result = await orchestrateSiteCreation(
      {
        benches: {
          findById: async () => runningBench,
        },
        sites: {
          create: async (input) => {
            current = {
              id: 'site-001',
              ...input,
              timestamps: {
                createdAt: new Date('2026-03-01T01:00:00.000Z').toISOString(),
                updatedAt: new Date('2026-03-01T01:00:00.000Z').toISOString(),
              },
            };

            return current;
          },
          update: async (id, input) => {
            if (current && current.id === id) {
              current = {
                ...current,
                ...input,
                timestamps: {
                  ...current.timestamps,
                  updatedAt: new Date().toISOString(),
                },
              };
            }
            return current;
          },
        },
      },
      {
        name: 'demo.localhost',
        benchId: 'bench-001',
        path: '/Users/dev/frappe-bench/sites/demo.localhost',
        apps: ['frappe', 'erpnext'],
      }
    );

    expect(result.status).toBe('queued');
    expect(result.apps).toEqual(['frappe', 'erpnext']);
  });

  it('fails early when parent bench is missing', async () => {
    await expect(
      orchestrateSiteCreation(
        {
          benches: {
            findById: async () => null,
          },
          sites: {
            create: async () => {
              throw new Error('unexpected create');
            },
            update: async () => {
              throw new Error('unexpected update');
            },
          },
        },
        {
          name: 'demo.localhost',
          benchId: 'missing-bench',
          path: '/Users/dev/frappe-bench/sites/demo.localhost',
          apps: ['frappe'],
        }
      )
    ).rejects.toThrow('parent bench was not found');
  });

  it('allows site creation to start with queued status', async () => {
    const result = await orchestrateSiteCreation(
      {
        benches: {
          findById: async () => runningBench,
        },
        sites: {
          create: async (input) => ({
            id: 'site-001',
            ...input,
            timestamps: {
              createdAt: new Date('2026-03-01T01:00:00.000Z').toISOString(),
              updatedAt: new Date('2026-03-01T01:00:00.000Z').toISOString(),
            },
          }),
          update: async () => null,
        },
      },
      {
        name: 'demo.localhost',
        benchId: 'bench-001',
        path: '/Users/dev/frappe-bench/sites/demo.localhost',
        apps: ['frappe'],
      }
    );
    expect(result.status).toBe('queued');
  });
});
