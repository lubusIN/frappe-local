import { describe, expect, it } from 'vitest';
import { normalizeTags, parseTagsFromText, filterSites, getFilterOptions } from '../src/renderer/tag-filters';
import type { Site } from '../src/shared/domain/models';

const mockSites: Site[] = [
  {
    id: 'site-001',
    name: 'demo.localhost',
    benchId: 'bench-001',
    groupId: 'grp-001',
    apps: ['frappe', 'erpnext'],
    status: 'running',
    path: '/Users/dev/frappe-bench/sites/demo.localhost',
    timestamps: {
      createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
    },
  },
  {
    id: 'site-002',
    name: 'test.localhost',
    benchId: 'bench-001',
    groupId: 'grp-001',
    apps: ['frappe'],
    status: 'stopped',
    path: '/Users/dev/frappe-bench/sites/test.localhost',
    timestamps: {
      createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
    },
  },
  {
    id: 'site-003',
    name: 'staging.localhost',
    benchId: 'bench-002',
    groupId: 'grp-002',
    apps: ['frappe', 'erpnext', 'payments'],
    status: 'running',
    path: '/Users/dev/frappe-bench/sites/staging.localhost',
    timestamps: {
      createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-02-02T00:00:00.000Z').toISOString(),
    },
  },
];

describe('tag filters', () => {
  it('normalizeTags removes duplicates and lowercases', () => {
    const tags = ['Client', 'client', 'PROJECT', 'project'];
    const result = normalizeTags(tags);

    expect(result).toEqual(['client', 'project']);
  });

  it('normalizeTags trims whitespace', () => {
    const tags = ['  client  ', '  project  '];
    const result = normalizeTags(tags);

    expect(result).toEqual(['client', 'project']);
  });

  it('parseTagsFromText splits by comma and normalizes', () => {
    const text = 'Client, PROJECT, dev ';
    const result = parseTagsFromText(text);

    expect(result).toEqual(['client', 'project', 'dev']);
  });

  it('filterSites filters by search query', () => {
    const result = filterSites(mockSites, { query: 'demo' });

    expect(result).toEqual([mockSites[0]]);
  });

  it('filterSites filters by status', () => {
    const result = filterSites(mockSites, { status: 'running' });

    expect(result).toEqual([mockSites[0], mockSites[2]]);
  });

  it('filterSites filters by groupId', () => {
    const result = filterSites(mockSites, { groupId: 'grp-001' });

    expect(result).toEqual([mockSites[0], mockSites[1]]);
  });

  it('filterSites combines multiple criteria', () => {
    const result = filterSites(mockSites, {
      query: 'localhost',
      status: 'running',
      groupId: 'grp-001',
    });

    expect(result).toEqual([mockSites[0]]);
  });

  it('getFilterOptions extracts statuses and tags', () => {
    const groupTagMap = new Map([
      ['grp-001', ['client', 'staging']],
      ['grp-002', ['production', 'client']],
    ]);

    const result = getFilterOptions(mockSites, groupTagMap);

    expect(result.statuses).toEqual(['running', 'stopped']);
    expect(result.tags).toContain('client');
    expect(result.tags).toContain('production');
    expect(result.tags).toContain('staging');
  });
});
