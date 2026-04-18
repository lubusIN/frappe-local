import { describe, expect, it, vi } from 'vitest';
import {
  applyRuntimeTaskEvent,
  createDefaultRuntimeHealthState,
  createRuntimeHealthController,
  formatRuntimeTaskLog,
} from '../src/renderer/runtime-health-controller';
import type { RuntimeHealthResponse } from '../src/shared/ipc';
import type { TaskProgressEvent } from '../src/shared/domain/task-runner';

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const readyHealth: RuntimeHealthResponse = {
  preferredRuntime: 'docker',
  selectedRuntime: 'docker',
  fallbackRuntime: null,
  fallbackApplied: false,
  dependencies: [],
  blockingDependencies: [],
  hasBlockingIssues: false,
};

describe('runtime health controller', () => {
  it('refreshes runtime health through the IPC bridge', async () => {
    const state = createDefaultRuntimeHealthState();
    const ipc = {
      getRuntimeHealth: vi.fn(async () => readyHealth),
      repairRuntime: vi.fn(),
      subscribeTaskRunnerEvents: vi.fn(async () => true),
      unsubscribeTaskRunnerEvents: vi.fn(async () => false),
      onTaskRunnerProgress: vi.fn(() => () => undefined),
    };

    const controller = createRuntimeHealthController(ipc, state);
    await controller.refresh();

    expect(ipc.getRuntimeHealth).toHaveBeenCalledTimes(1);
    expect(state.health).toEqual(readyHealth);
    expect(state.loading).toBe(false);
  });

  it('dispatches repair actions and refreshes after task completion events', async () => {
    const state = createDefaultRuntimeHealthState();
    let taskListener: ((event: TaskProgressEvent) => void) | null = null;
    const ipc = {
      getRuntimeHealth: vi
        .fn<() => Promise<RuntimeHealthResponse>>()
        .mockResolvedValueOnce({
          ...readyHealth,
          blockingDependencies: ['docker-compose'],
          hasBlockingIssues: true,
        })
        .mockResolvedValueOnce(readyHealth),
      repairRuntime: vi.fn(async () => ({
        taskId: 'task-123',
        preferredRuntime: 'docker' as const,
        selectedRuntime: 'docker' as const,
        fallbackApplied: false,
        dryRun: true,
        repairDependencies: ['docker-compose' as const],
      })),
      subscribeTaskRunnerEvents: vi.fn(async () => true),
      unsubscribeTaskRunnerEvents: vi.fn(async () => false),
      onTaskRunnerProgress: vi.fn((listener: (event: TaskProgressEvent) => void) => {
        taskListener = listener;
        return () => {
          taskListener = null;
        };
      }),
    };

    const controller = createRuntimeHealthController(ipc, state);
    await controller.connect();
    await controller.refresh();
    await controller.repair();

    taskListener?.({
      taskId: 'task-123',
      taskName: 'Repair docker runtime',
      type: 'task.started',
      status: 'running',
      stepId: null,
      stepName: null,
      message: 'Repair started.',
      timestamp: new Date().toISOString(),
      logLevel: null,
      errorCode: null,
    });
    taskListener?.({
      taskId: 'task-123',
      taskName: 'Repair docker runtime',
      type: 'task.completed',
      status: 'success',
      stepId: 'verify-runtime',
      stepName: 'Verify runtime readiness',
      message: 'Runtime dependencies are ready.',
      timestamp: new Date().toISOString(),
      logLevel: null,
      errorCode: null,
    });
    await flushPromises();

    expect(ipc.repairRuntime).toHaveBeenCalledTimes(1);
    expect(state.activeTaskId).toBe('task-123');
    expect(state.activeTaskStatus).toBe('success');
    expect(state.repairing).toBe(false);
    expect(state.repairLogs[0]).toBe('task.completed: Runtime dependencies are ready.');
    expect(ipc.getRuntimeHealth).toHaveBeenCalledTimes(2);
  });

  it('formats and applies runtime task events only for the active task', () => {
    const state = createDefaultRuntimeHealthState();
    state.activeTaskId = 'task-123';
    state.repairing = true;

    const ignored = applyRuntimeTaskEvent(state, {
      taskId: 'task-other',
      taskName: 'Other task',
      type: 'task.log',
      status: 'running',
      stepId: null,
      stepName: null,
      message: 'Ignore me.',
      timestamp: new Date().toISOString(),
      logLevel: 'info',
      errorCode: null,
    });

    const appliedEvent: TaskProgressEvent = {
      taskId: 'task-123',
      taskName: 'Repair docker runtime',
      type: 'task.failed',
      status: 'failure',
      stepId: 'repair-docker-compose',
      stepName: 'Repair docker-compose',
      message: 'Repair failed.',
      timestamp: new Date().toISOString(),
      logLevel: 'error',
      errorCode: 'task-failed',
    };
    const applied = applyRuntimeTaskEvent(state, appliedEvent);

    expect(ignored).toBe(false);
    expect(applied).toBe(true);
    expect(formatRuntimeTaskLog(appliedEvent)).toBe('task.failed: Repair failed.');
    expect(state.repairing).toBe(false);
    expect(state.repairLogs[0]).toBe('task.failed: Repair failed.');
  });
});