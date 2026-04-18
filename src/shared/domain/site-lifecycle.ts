import type { Bench, Site } from './models';

type SiteStatus = Site['status'];
type BenchStatus = Bench['status'];

const SITE_STATUS_TRANSITIONS: Record<SiteStatus, SiteStatus[]> = {
  queued: ['running', 'stopped', 'failure'],
  running: ['stopped', 'failure'],
  stopped: ['running', 'success'],
  success: ['running', 'stopped'],
  failure: ['stopped', 'running'],
};

export const canTransitionSiteStatus = (current: SiteStatus, next: SiteStatus): boolean => {
  if (current === next) {
    return true;
  }

  return SITE_STATUS_TRANSITIONS[current].includes(next);
};

export const canAttachSiteToBench = (benchStatus: BenchStatus): boolean => benchStatus !== 'failure';

export const isBenchReadyForSiteStatus = (benchStatus: BenchStatus, targetSiteStatus: SiteStatus): boolean => {
  if (targetSiteStatus === 'running') {
    return benchStatus === 'running' || benchStatus === 'success';
  }

  return canAttachSiteToBench(benchStatus);
};