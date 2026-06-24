import type { Bench, Site } from '@frappe-local/shared/domain';

type SiteStatus = Site['status'];
type BenchStatus = Bench['status'];

const SITE_STATUS_TRANSITIONS: Record<SiteStatus, SiteStatus[]> = {
  queued: ['ready', 'failure'],
  ready: ['queued', 'failure'],
  failure: ['queued', 'ready'],
};

export const canTransitionSiteStatus = (current: SiteStatus, next: SiteStatus): boolean => {
  if (current === next) {
    return true;
  }

  return SITE_STATUS_TRANSITIONS[current].includes(next);
};

export const canAttachSiteToBench = (benchStatus: BenchStatus): boolean => benchStatus !== 'failure';

export const isBenchReadyForSiteStatus = (benchStatus: BenchStatus, targetSiteStatus: SiteStatus): boolean => {
  if (targetSiteStatus === 'ready') {
    return benchStatus === 'running' || benchStatus === 'success';
  }

  return canAttachSiteToBench(benchStatus);
};