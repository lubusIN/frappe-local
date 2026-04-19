import type { Settings } from '../shared/domain/models';
import type { UpdateCheckResult, UpdateStrategyStatus } from '../shared/ipc';

export const buildUpdateStrategyStatus = (
  settings: Pick<Settings, 'updateChannel' | 'autoUpdateEnabled'> | null,
  currentVersion: string
): UpdateStrategyStatus => {
  const channel = settings?.updateChannel ?? 'stable';
  const autoUpdateEnabled = settings?.autoUpdateEnabled ?? false;

  return {
    mode: 'deferred-manual',
    channel,
    autoUpdateEnabled,
    currentVersion,
    summary:
      'Automatic updates are deferred for this release. Use manual download and install from release artifacts.',
    rollbackGuidance: [
      'Keep the previous release artifact available before upgrading.',
      'If launch fails after upgrade, reinstall the previous version and restore user data from backup.',
      'Use diagnostics in Settings to verify runtime health after rollback.',
    ],
  };
};

export const runManualUpdateCheck = (): UpdateCheckResult => {
  return {
    checkedAt: new Date().toISOString(),
    source: 'manual',
    status: 'not-configured',
    message:
      'Remote update checks are not configured yet. Download the latest release package manually.',
  };
};
