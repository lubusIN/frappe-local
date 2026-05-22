import { describe, expect, it } from 'vitest';
import {
  createDefaultProgressCenterState,
  detectProgressTaskResource,
  filterProgressTasks,
  upsertProgressTask,
} from '../../../src/renderer/controllers/progress';
import type { TaskProgressEvent } from '../../../src/shared/domain/task-runner';

const makeEvent = (overrides: Partial<TaskProgressEvent> = {}): TaskProgressEvent => ({
  taskId: overrides.taskId ?? 'task-1',
  taskName: overrides.taskName ?? 'Create bench demo',
  resource: overrides.resource,
  type: overrides.type ?? 'task.started',
  status: overrides.status ?? 'running',
  stepId: overrides.stepId ?? null,
  stepName: overrides.stepName ?? null,
  message: overrides.message ?? 'Started',
  timestamp: overrides.timestamp ?? new Date('2026-04-19T08:00:00.000Z').toISOString(),
  logLevel: overrides.logLevel ?? null,
  errorCode: overrides.errorCode ?? null,
});

describe('progress', () => {
  it('detects task resource from task name', () => {
    expect(detectProgressTaskResource('Create bench alpha')).toBe('bench');
    expect(detectProgressTaskResource('Start site demo')).toBe('site');
    expect(detectProgressTaskResource('Background package artifact')).toBe('system');
    expect(detectProgressTaskResource('Repair runtime dependencies')).toBe('runtime');
    expect(detectProgressTaskResource('Background refresh')).toBe('system');
  });

  it('upserts task summaries by task id', () => {
    const first = makeEvent();
    const next = makeEvent({
      status: 'success',
      type: 'task.completed',
      message: 'Completed',
      timestamp: new Date('2026-04-19T08:10:00.000Z').toISOString(),
    });

    const afterFirst = upsertProgressTask([], first);
    const afterSecond = upsertProgressTask(afterFirst, next);

    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.status).toBe('success');
    expect(afterSecond[0]?.message).toBe('Completed');
    expect(afterSecond[0]?.resourceId).toBeNull();
  });

  it('prefers payload resource metadata for exact targeting', () => {
    const event = makeEvent({
      taskName: 'Background operation',
      resource: {
        type: 'site',
        id: 'site-007',
      },
    });

    const tasks = upsertProgressTask([], event);
    expect(tasks[0]?.resource).toBe('site');
    expect(tasks[0]?.resourceId).toBe('site-007');
  });

  it('filters task summaries by status, resource, and time window', () => {
    const now = new Date('2026-04-19T09:00:00.000Z').valueOf();
    const state = createDefaultProgressCenterState();
    state.tasks = [
      {
        taskId: 'recent-runtime',
        taskName: 'Repair runtime dependencies',
        status: 'running',
        type: 'task.started',
        message: 'Repairing runtime',
        logs: [],
        stepName: null,
        timestamp: new Date('2026-04-19T08:45:00.000Z').toISOString(),
        resource: 'runtime',
        resourceId: 'podman',
      },
      {
        taskId: 'old-site',
        taskName: 'Start site alpha',
        status: 'success',
        type: 'task.completed',
        message: 'Done',
        logs: [],
        stepName: null,
        timestamp: new Date('2026-04-17T08:00:00.000Z').toISOString(),
        resource: 'site',
        resourceId: 'site-old',
      },
    ];

    state.statusFilter = 'running';
    state.resourceFilter = 'runtime';
    state.recentOnly = true;

    const filtered = filterProgressTasks(state, now);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.taskId).toBe('recent-runtime');
  });
});
