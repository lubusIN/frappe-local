import { describe, expect, it } from 'vitest';
import {
  canAttachSiteToBench,
  canTransitionSiteStatus,
  isBenchReadyForSiteStatus,
} from '../../../src/shared/domain/site-lifecycle';

describe('site lifecycle helpers', () => {
  it('allows legal status transitions and blocks invalid transitions', () => {
    expect(canTransitionSiteStatus('queued', 'ready')).toBe(true);
    expect(canTransitionSiteStatus('ready', 'queued')).toBe(true);
    expect(canTransitionSiteStatus('ready', 'ready')).toBe(true);
  });

  it('checks bench attach readiness and running requirements', () => {
    expect(canAttachSiteToBench('running')).toBe(true);
    expect(canAttachSiteToBench('failure')).toBe(false);

    expect(isBenchReadyForSiteStatus('running', 'ready')).toBe(true);
    expect(isBenchReadyForSiteStatus('stopped', 'ready')).toBe(false);
    expect(isBenchReadyForSiteStatus('stopped', 'queued')).toBe(true);
  });
});
