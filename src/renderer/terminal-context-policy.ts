import type { BenchListItem, SiteListItem } from '../shared/ipc';

export type TerminalTarget = {
  readonly benchId: string;
  readonly siteId: string | null;
};

export const normalizeTargetForBench = (
  benchId: string,
  siteId: string | null,
  sites: readonly SiteListItem[]
): TerminalTarget => {
  const siteStillMatches = sites.some((site) => site.id === siteId && site.benchId === benchId);

  return {
    benchId,
    siteId: siteStillMatches ? siteId : null,
  };
};

export const shouldResetSessionOnContextSwitch = (
  hasSession: boolean,
  previousTarget: TerminalTarget,
  nextTarget: TerminalTarget
): boolean => {
  if (!hasSession) {
    return false;
  }

  return previousTarget.benchId !== nextTarget.benchId || previousTarget.siteId !== nextTarget.siteId;
};

export const resolveContextLabel = (
  benches: readonly BenchListItem[],
  sites: readonly SiteListItem[],
  target: TerminalTarget
): string => {
  const bench = benches.find((entry) => entry.id === target.benchId);
  if (!bench) {
    return 'No context selected';
  }

  if (!target.siteId) {
    return `${bench.name} / bench root`;
  }

  const site = sites.find((entry) => entry.id === target.siteId && entry.benchId === target.benchId);
  if (!site) {
    return `${bench.name} / bench root`;
  }

  return `${bench.name} / ${site.name}`;
};

export const validateTerminalTarget = (
  benches: readonly BenchListItem[],
  sites: readonly SiteListItem[],
  target: TerminalTarget
): {
  readonly valid: boolean;
  readonly normalizedTarget: TerminalTarget;
  readonly reason: string | null;
} => {
  const bench = benches.find((entry) => entry.id === target.benchId);
  if (!bench) {
    return {
      valid: false,
      normalizedTarget: {
        benchId: '',
        siteId: null,
      },
      reason: target.benchId ? 'Selected bench is no longer available.' : 'Select a bench to continue.',
    };
  }

  const normalizedTarget = normalizeTargetForBench(target.benchId, target.siteId, sites);
  if (target.siteId && normalizedTarget.siteId === null) {
    return {
      valid: true,
      normalizedTarget,
      reason: 'Selected site is no longer available in this bench. Context was reset to bench root.',
    };
  }

  return {
    valid: true,
    normalizedTarget,
    reason: null,
  };
};
