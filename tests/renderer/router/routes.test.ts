import { describe, expect, it } from 'vitest';
import { appRouteDefinitions, navigationItems } from '../../../src/renderer/router/navigation';

describe('renderer routes', () => {
  it('keeps all primary sections registered', () => {
    expect(appRouteDefinitions.map((route) => route.name)).toEqual([
      'dashboard',
      'sites',
      'benches',
      'customApps',
      'activity',
      'diagnostics',
    ]);
  });

  it('keeps navigation items aligned with route paths', () => {
    expect(navigationItems.map((item) => item.path)).toEqual(appRouteDefinitions.map((route) => route.path));
  });
});
