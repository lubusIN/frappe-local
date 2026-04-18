import { describe, expect, it } from 'vitest';
import { canStartSiteFromUi, canStopSiteFromUi } from '../src/renderer/site-action-guards';

describe('site action guards', () => {
  const benches = [
    { id: 'bench-001', status: 'running' as const },
    { id: 'bench-002', status: 'stopped' as const },
  ];

  it('allows start only when site is not running and bench is ready', () => {
    expect(canStartSiteFromUi({ status: 'stopped', benchId: 'bench-001' }, benches)).toBe(true);
    expect(canStartSiteFromUi({ status: 'stopped', benchId: 'bench-002' }, benches)).toBe(false);
    expect(canStartSiteFromUi({ status: 'running', benchId: 'bench-001' }, benches)).toBe(false);
  });

  it('allows stop only when site is not already stopped', () => {
    expect(canStopSiteFromUi({ status: 'running' })).toBe(true);
    expect(canStopSiteFromUi({ status: 'stopped' })).toBe(false);
  });
});
