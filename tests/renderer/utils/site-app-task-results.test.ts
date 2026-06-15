import { describe, expect, it } from 'vitest';
import type { ProgressTaskSummary } from '../../../src/renderer/controllers/progress';
import {
  isCompletedSiteAppUpdateTask,
  isCompletedSiteCreationTask,
} from '../../../src/renderer/utils/sites/site-app-task-results';

const makeTask = (overrides: Partial<ProgressTaskSummary> = {}): ProgressTaskSummary => ({
  taskId: overrides.taskId ?? 'task-1',
  taskName: overrides.taskName ?? 'Update Site Apps alpha.localhost',
  status: overrides.status ?? 'running',
  type: overrides.type ?? 'task.started',
  message: overrides.message ?? 'Updating',
  logs: overrides.logs ?? [],
  stepName: overrides.stepName ?? null,
  timestamp: overrides.timestamp ?? new Date('2026-05-17T00:00:00.000Z').toISOString(),
  errorCode: overrides.errorCode ?? null,
  resource: overrides.resource ?? 'site',
  resourceId: overrides.resourceId ?? 'site-1',
});

describe('site app task results', () => {
  it('detects completed site creation tasks only', () => {
    expect(isCompletedSiteCreationTask(makeTask({
      taskName: 'Create Site: alpha.localhost',
      status: 'success',
      type: 'task.completed',
    }))).toBe(true);
    expect(isCompletedSiteCreationTask(makeTask({
      taskName: 'Create Site: alpha.localhost',
      status: 'failure',
      type: 'task.failed',
    }))).toBe(true);
    expect(isCompletedSiteCreationTask(makeTask({
      taskName: 'Create Site: alpha.localhost',
      status: 'running',
      type: 'task.started',
    }))).toBe(false);
    expect(isCompletedSiteCreationTask(makeTask({
      taskName: 'Create Site: alpha.localhost',
      resource: 'bench',
      status: 'success',
    }))).toBe(false);
  });

  it('detects completed site app update tasks only', () => {
    expect(isCompletedSiteAppUpdateTask(makeTask({ status: 'success', type: 'task.completed' }))).toBe(true);
    expect(isCompletedSiteAppUpdateTask(makeTask({ status: 'failure', type: 'task.failed' }))).toBe(true);
    expect(isCompletedSiteAppUpdateTask(makeTask({ status: 'running', type: 'task.started' }))).toBe(false);
    expect(isCompletedSiteAppUpdateTask(makeTask({ resource: 'bench', status: 'success', type: 'task.completed' }))).toBe(false);
    expect(isCompletedSiteAppUpdateTask(makeTask({ taskName: 'Start Site alpha.localhost', status: 'success', type: 'task.completed' }))).toBe(false);
  });
});
