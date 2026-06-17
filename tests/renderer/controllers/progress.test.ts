import { describe, expect, it } from 'vitest';
import {
  createDefaultProgressCenterState,
  detectProgressTaskResource,
  filterProgressTasks,
  findUnhandledFailedTask,
  MAX_LOGS_PER_TASK,
  reconcileSavedProgressTasks,
  upsertProgressTask,
} from '../../../src/renderer/controllers/progress';
import type { ProgressTaskSummary } from '../../../src/renderer/controllers/progress';
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
    expect(afterSecond[0]?.errorCode).toBeNull();
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

  it('preserves task failure codes for global failure handling', () => {
    const tasks = upsertProgressTask([], makeEvent({
      status: 'failure',
      type: 'task.failed',
      errorCode: 'task-failed',
    }));

    expect(tasks[0]?.errorCode).toBe('task-failed');
  });

  it('keeps only the latest log entries for long-running tasks', () => {
    let tasks: ProgressTaskSummary[] = [];

    for (let index = 0; index < MAX_LOGS_PER_TASK + 25; index++) {
      tasks = upsertProgressTask(tasks, makeEvent({
        message: `line ${index}`,
        timestamp: new Date(Date.UTC(2026, 3, 19, 8, 0, index)).toISOString(),
        logLevel: 'info',
      }));
    }

    expect(tasks[0]?.logs).toHaveLength(MAX_LOGS_PER_TASK);
    expect(tasks[0]?.logs[0]?.message).toBe('line 25');
    expect(tasks[0]?.logs.at(-1)?.message).toBe(`line ${MAX_LOGS_PER_TASK + 24}`);
  });

  it('marks saved active tasks as interrupted on startup', () => {
    const saved = upsertProgressTask([], makeEvent({
      taskId: 'stale-migrate',
      taskName: 'Install app hrms on frappe.localhost',
      status: 'running',
      type: 'task.log',
      message: 'Running migrate for frappe.localhost',
      stepName: 'Running migrate for frappe.localhost',
      logLevel: 'info',
    }));

    const reconciled = reconcileSavedProgressTasks(saved);

    expect(reconciled[0]?.status).toBe('failure');
    expect(reconciled[0]?.type).toBe('task.failed');
    expect(reconciled[0]?.message).toBe('Task was interrupted when the app closed.');
    expect(reconciled[0]?.errorCode).toBe('task-interrupted');
    expect(reconciled[0]?.logs.at(-1)?.level).toBe('warning');
  });

  it('selects only unhandled non-cancelled failures when logs are closed', () => {
    const failed = upsertProgressTask([], makeEvent({
      taskId: 'failed',
      status: 'failure',
      type: 'task.failed',
      errorCode: 'task-failed',
    }))[0]!;
    const cancelled = upsertProgressTask([], makeEvent({
      taskId: 'cancelled',
      status: 'failure',
      type: 'task.failed',
      errorCode: 'cancelled',
    }))[0]!;

    expect(findUnhandledFailedTask([cancelled, failed], new Set())).toBe(failed);
    expect(findUnhandledFailedTask([failed], new Set(['failed']))).toBeNull();
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
        errorCode: null,
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
        errorCode: null,
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
