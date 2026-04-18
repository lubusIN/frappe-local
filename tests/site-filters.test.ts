import { describe, expect, it } from 'vitest';
import { filterSites } from '../src/renderer/site-filters';

const sites = [
  {
    id: 'site-001',
    name: 'alpha.localhost',
    benchId: 'bench-001',
    groupId: null,
    status: 'running',
    path: '/tmp/bench-001/sites/alpha.localhost',
    appCount: 2,
    createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
  },
  {
    id: 'site-002',
    name: 'beta.localhost',
    benchId: 'bench-002',
    groupId: null,
    status: 'stopped',
    path: '/tmp/bench-002/sites/beta.localhost',
    appCount: 1,
    createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-04-01T00:00:00.000Z').toISOString(),
  },
] as const;

describe('site filters', () => {
  it('filters by bench id', () => {
    const result = filterSites(sites, {
      benchId: 'bench-001',
      status: '',
      search: '',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('site-001');
  });

  it('filters by status', () => {
    const result = filterSites(sites, {
      benchId: '',
      status: 'stopped',
      search: '',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('site-002');
  });

  it('filters by search across name/path/bench', () => {
    const result = filterSites(sites, {
      benchId: '',
      status: '',
      search: 'beta',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('site-002');
  });
});
