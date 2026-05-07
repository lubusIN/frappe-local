import type { RouteLocationRaw } from 'vue-router';

export type ErrorRemediationAction = {
  readonly id: string;
  readonly label: string;
  readonly to?: RouteLocationRaw;
};

export type ErrorRemediationNotice = {
  readonly title: string;
  readonly reason: string;
  readonly steps: string[];
  readonly actions: ErrorRemediationAction[];
};

export type ErrorRemediationContext = 'runtime' | 'progress-center' | 'app-health';

const normalizeReason = (error: string): string => error.replace(/^Error:\s*/i, '').trim();

export const buildErrorRemediationNotice = (
  context: ErrorRemediationContext,
  error: string
): ErrorRemediationNotice => {
  const reason = normalizeReason(error);
  const normalized = reason.toLowerCase();

  if (normalized.includes('ipc bridge is unavailable')) {
    return {
      title: 'Renderer bridge unavailable',
      reason,
      steps: [
        'Reload the window so the preload bridge can reconnect.',
        'If the problem persists, restart the app and verify preload initialization.',
      ],
      actions: [{ id: 'retry', label: 'Try again' }],
    };
  }

  if (context === 'runtime') {
    if (normalized.includes('blocked by:')) {
      return {
        title: 'Runtime repair did not clear all blockers',
        reason,
        steps: [
          'Review the dependency guidance listed below for each blocked dependency.',
          'Run repair again after resolving the missing dependency outside the app if needed.',
        ],
        actions: [
          { id: 'retry', label: 'Re-check runtime' },
          { id: 'settings', label: 'Open Settings', to: '/settings' },
        ],
      };
    }

    return {
      title: 'Runtime action failed',
      reason,
      steps: [
        'Re-check runtime health to confirm the latest dependency state.',
      ],
      actions: [
        { id: 'retry', label: 'Re-check runtime' },
        { id: 'settings', label: 'Open Settings', to: '/settings' },
      ],
    };
  }

  if (context === 'progress-center') {
    return {
      title: 'Task stream is unavailable',
      reason,
      steps: [
        'Stay on the dashboard and retry the subscription if task updates should be active.',
        'If task events remain unavailable, reload the app to reconnect the renderer bridge.',
      ],
      actions: [{ id: 'retry', label: 'Retry subscription' }],
    };
  }

  return {
    title: 'System health could not be loaded',
    reason,
    steps: ['Refresh the dashboard to request a fresh health check from the main process.'],
    actions: [{ id: 'retry', label: 'Try again' }],
  };
};
