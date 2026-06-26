import { describe, expect, it } from 'vitest';
import { InMemoryAnalytics } from '../../../src/main/services/analytics';

describe('InMemoryAnalytics', () => {
  it('tracks operations and lists tracked metrics', () => {
    const analytics = new InMemoryAnalytics();

    expect(analytics.list()).toEqual([]);

    analytics.trackOperation('bench-1', 'create');
    analytics.trackOperation('site-1', 'update');

    const metrics = analytics.list();
    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({
      entityId: 'bench-1',
      operation: 'create',
    });
    expect(metrics[1]).toMatchObject({
      entityId: 'site-1',
      operation: 'update',
    });
    expect(typeof metrics[0]!.timestamp).toBe('string');
  });

  it('list returns a copy of events rather than internal reference', () => {
    const analytics = new InMemoryAnalytics();
    analytics.trackOperation('bench-1', 'delete');

    const firstCopy = analytics.list();
    firstCopy.pop();

    expect(analytics.list()).toHaveLength(1);
  });
});
