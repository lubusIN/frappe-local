import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useResourceTaskState } from '../../../src/renderer/composables/system/useResourceTaskState';
import type { ProgressTaskSummary } from '../../../src/renderer/controllers/progress';

const makeTask = (overrides: Partial<ProgressTaskSummary> = {}): ProgressTaskSummary => ({
  taskId: overrides.taskId ?? 'task-1',
  taskName: overrides.taskName ?? 'Update Bench Apps demo',
  status: overrides.status ?? 'failure',
  type: overrides.type ?? 'task.failed',
  message: overrides.message ?? 'Failed to fetch app',
  logs: overrides.logs ?? [],
  stepName: overrides.stepName ?? null,
  timestamp: overrides.timestamp ?? '2026-06-07T08:00:00.000Z',
  resource: overrides.resource ?? 'bench',
  resourceId: overrides.resourceId ?? 'bench-1',
});

describe('useResourceTaskState', () => {
  it('lets a newer active action replace an old app install failure', () => {
    const tasks = ref<ProgressTaskSummary[]>([
      makeTask({
        taskId: 'restart',
        taskName: 'Restart Bench demo',
        status: 'running',
        type: 'task.started',
        message: 'Restarting',
        stepName: 'Restarting containers',
        timestamp: '2026-06-07T08:05:00.000Z',
      }),
      makeTask({ taskId: 'failed-install' }),
    ]);

    const state = useResourceTaskState('bench', tasks);
    const bench = { id: 'bench-1', status: 'running' };

    expect(state.formatStatusLabel(bench)).toBe('Restarting');
    expect(state.getStatusTheme(bench)).toBe('blue');
  });

  it('does not revive an old app install failure after a newer task succeeds', () => {
    const tasks = ref<ProgressTaskSummary[]>([
      makeTask({
        taskId: 'successful-start',
        taskName: 'Start Bench demo',
        status: 'success',
        type: 'task.completed',
        message: 'Completed',
        timestamp: '2026-06-07T08:10:00.000Z',
      }),
      makeTask({ taskId: 'failed-install' }),
    ]);

    const state = useResourceTaskState('bench', tasks);
    const bench = { id: 'bench-1', status: 'running' };

    expect(state.formatStatusLabel(bench)).toBe('Running');
    expect(state.getStatusTheme(bench)).toBe('green');
  });

  it('still shows an app failure when it is the latest task', () => {
    const tasks = ref<ProgressTaskSummary[]>([
      makeTask({ taskId: 'failed-install', message: 'Command timed out' }),
      makeTask({
        taskId: 'older-start',
        taskName: 'Start Bench demo',
        status: 'success',
        type: 'task.completed',
        timestamp: '2026-06-07T07:55:00.000Z',
      }),
    ]);

    const state = useResourceTaskState('bench', tasks);
    const bench = { id: 'bench-1', status: 'running' };

    expect(state.formatStatusLabel(bench)).toBe('Install timed out');
    expect(state.getStatusTheme(bench)).toBe('red');
  });
});
