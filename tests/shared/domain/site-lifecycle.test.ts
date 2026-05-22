import { describe, expect, it } from 'vitest';
import {
  canAttachSiteToBench,
  canTransitionSiteStatus,
  isBenchReadyForSiteStatus,
} from '../../../src/shared/domain/site-lifecycle';

describe('site lifecycle helpers', () => {
  it('allows legal status transitions and blocks invalid transitions', () => {
    expect(canTransitionSiteStatus('stopped', 'running')).toBe(true);
    expect(canTransitionSiteStatus('running', 'stopped')).toBe(true);
    expect(canTransitionSiteStatus('running', 'success')).toBe(false);
  });

  it('checks bench attach readiness and running requirements', () => {
    expect(canAttachSiteToBench('running')).toBe(true);
    expect(canAttachSiteToBench('failure')).toBe(false);

    expect(isBenchReadyForSiteStatus('running', 'running')).toBe(true);
    expect(isBenchReadyForSiteStatus('stopped', 'running')).toBe(false);
    expect(isBenchReadyForSiteStatus('stopped', 'stopped')).toBe(true);
  });
});
