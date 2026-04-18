import { describe, expect, it } from 'vitest';
import { filterSiteLogs } from '../src/renderer/site-log-filters';

describe('site log filters', () => {
  const logs = [
    { id: '1', entityId: 'site-1', level: 'info' as const, message: 'bench ready', timestamp: '2026-01-01T00:00:00.000Z' },
    { id: '2', entityId: 'site-1', level: 'error' as const, message: 'failed to start site', timestamp: '2026-01-01T00:01:00.000Z' },
  ];

  it('filters by query', () => {
    expect(filterSiteLogs(logs, 'ready', 'all')).toHaveLength(1);
    expect(filterSiteLogs(logs, 'missing', 'all')).toHaveLength(0);
  });

  it('filters by level', () => {
    expect(filterSiteLogs(logs, '', 'info')).toHaveLength(1);
    expect(filterSiteLogs(logs, '', 'error')).toHaveLength(1);
    expect(filterSiteLogs(logs, '', 'all')).toHaveLength(2);
  });
});
