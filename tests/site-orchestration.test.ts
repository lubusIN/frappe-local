import { describe, expect, it } from 'vitest';
import { orchestrateSiteCreation } from '../src/main/site-orchestration';
import type { Bench, Site } from '../src/shared/domain/models';

const runningBench: Bench = {
  id: 'bench-001',
  name: 'frappe-bench',
  path: '/Users/dev/frappe-bench',
  frappeVersion: '15.0.0',
  runtime: 'docker',
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
          findAll: async () => [runningBench],
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
          update: async () => {
            current = {
              ...(current as Site),
              status: 'stopped',
              timestamps: {
                ...(current as Site).timestamps,
                updatedAt: new Date('2026-03-01T01:01:00.000Z').toISOString(),
              },
            };

            return current;
          },
        },
      },
      {
        name: 'demo.localhost',
        benchId: 'bench-001',
        groupId: null,
        path: '/Users/dev/frappe-bench/sites/demo.localhost',
        apps: ['frappe', 'erpnext'],
      }
    );

    expect(result.status).toBe('stopped');
    expect(result.apps).toEqual(['frappe', 'erpnext']);
  });

  it('fails early when parent bench is missing', async () => {
    await expect(
      orchestrateSiteCreation(
        {
          benches: {
            findAll: async () => [],
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
          groupId: null,
          path: '/Users/dev/frappe-bench/sites/demo.localhost',
          apps: ['frappe'],
        }
      )
    ).rejects.toThrow('parent bench was not found');
  });

  it('fails when finalize update does not return a site', async () => {
    await expect(
      orchestrateSiteCreation(
        {
          benches: {
            findAll: async () => [runningBench],
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
          groupId: null,
          path: '/Users/dev/frappe-bench/sites/demo.localhost',
          apps: ['frappe'],
        }
      )
    ).rejects.toThrow('Cannot finalize site creation.');
  });
});
