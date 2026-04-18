import { describe, expect, it } from 'vitest';
import {
  normalizeTargetForBench,
  resolveContextLabel,
  shouldResetSessionOnContextSwitch,
  validateTerminalTarget,
} from '../src/renderer/terminal-context-policy';

const benches = [
  {
    id: 'bench-1',
    name: 'Alpha Bench',
    path: '/Users/example/alpha',
    frappeVersion: '15',
    runtime: 'docker',
    status: 'running',
    appCount: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'bench-2',
    name: 'Beta Bench',
    path: '/Users/example/beta',
    frappeVersion: '15',
    runtime: 'docker',
    status: 'running',
    appCount: 1,
    createdAt: '',
    updatedAt: '',
  },
] as const;

const sites = [
  {
    id: 'site-1',
    name: 'alpha.localhost',
    benchId: 'bench-1',
    groupId: null,
    status: 'running',
    path: '/Users/example/alpha/sites/alpha.localhost',
    appCount: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'site-2',
    name: 'beta.localhost',
    benchId: 'bench-2',
    groupId: null,
    status: 'running',
    path: '/Users/example/beta/sites/beta.localhost',
    appCount: 1,
    createdAt: '',
    updatedAt: '',
  },
] as const;

describe('terminal context switch policy', () => {
  it('normalizes site selection when the bench changes', () => {
    expect(normalizeTargetForBench('bench-2', 'site-1', sites)).toEqual({
      benchId: 'bench-2',
      siteId: null,
    });
  });

  it('keeps site selection when it still belongs to the selected bench', () => {
    expect(normalizeTargetForBench('bench-1', 'site-1', sites)).toEqual({
      benchId: 'bench-1',
      siteId: 'site-1',
    });
  });

  it('requires a session reset when the bench changes', () => {
    expect(
      shouldResetSessionOnContextSwitch(
        true,
        { benchId: 'bench-1', siteId: null },
        { benchId: 'bench-2', siteId: null }
      )
    ).toBe(true);
  });

  it('requires a session reset when the site changes', () => {
    expect(
      shouldResetSessionOnContextSwitch(
        true,
        { benchId: 'bench-1', siteId: null },
        { benchId: 'bench-1', siteId: 'site-1' }
      )
    ).toBe(true);
  });

  it('does not require a reset when there is no active session', () => {
    expect(
      shouldResetSessionOnContextSwitch(
        false,
        { benchId: 'bench-1', siteId: null },
        { benchId: 'bench-2', siteId: null }
      )
    ).toBe(false);
  });

  it('builds a readable bench-root context label', () => {
    expect(resolveContextLabel(benches, sites, { benchId: 'bench-1', siteId: null })).toBe(
      'Alpha Bench / bench root'
    );
  });

  it('builds a readable site context label', () => {
    expect(resolveContextLabel(benches, sites, { benchId: 'bench-2', siteId: 'site-2' })).toBe(
      'Beta Bench / beta.localhost'
    );
  });

  it('flags a missing bench as invalid', () => {
    const result = validateTerminalTarget(benches, sites, { benchId: 'missing', siteId: null });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Selected bench is no longer available.');
  });

  it('downgrades a missing site to bench root with a reason', () => {
    const result = validateTerminalTarget(benches, sites, { benchId: 'bench-1', siteId: 'site-2' });
    expect(result.valid).toBe(true);
    expect(result.normalizedTarget).toEqual({ benchId: 'bench-1', siteId: null });
    expect(result.reason).toContain('bench root');
  });
});
