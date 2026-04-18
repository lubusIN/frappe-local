import { describe, expect, it } from 'vitest';
import { appRouteDefinitions, navigationItems } from '../src/renderer/navigation';

describe('renderer routes', () => {
  it('keeps all primary sections registered', () => {
    expect(appRouteDefinitions.map((route) => route.name)).toEqual([
      'dashboard',
      'benches',
      'sites',
      'workspaces',
      'console',
      'settings',
    ]);
  });

  it('keeps navigation items aligned with route paths', () => {
    expect(navigationItems.map((item) => item.path)).toEqual(appRouteDefinitions.map((route) => route.path));
  });
});