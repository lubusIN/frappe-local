import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { ProgressTaskSummary } from '../../../src/renderer/controllers/progress';

const tasks = ref<ProgressTaskSummary[]>([]);
const handledFailureTaskIds = vi.hoisted(() => new Set<string>());
vi.mock('../../../src/renderer/composables/system/useProgressCenter', () => ({
  getProgressTasks: () => tasks,
  handledFailureTaskIds,
}));

import { runAndWaitForTask, TaskCancelledError, TaskFailedError } from '../../../src/renderer/composables/system/waitForTask';

const makeTask = (status: ProgressTaskSummary['status']): ProgressTaskSummary => ({
  taskId: 'task-1', taskName: 'Build bench demo', status,
  type: 'task.completed', message: '', logs: [], stepName: null,
  createdAt: new Date().toISOString(), timestamp: new Date().toISOString(),
  errorCode: null, resource: 'bench', resourceId: 'bench-1',
});

beforeEach(() => {
  tasks.value = [];
  handledFailureTaskIds.clear();
});

describe('waiting for background tasks', () => {
  it.each([false, null])('rejects a failed start (%s) without waiting for a task', async (result) => {
    await expect(runAndWaitForTask(async () => result, 'bench', 'bench-1'))
      .rejects.toThrow('could not be started');
  });

  it('preserves errors thrown by the action', async () => {
    await expect(runAndWaitForTask(async () => { throw new Error('IPC unavailable'); }, 'bench', 'bench-1'))
      .rejects.toThrow('IPC unavailable');
  });

  it('accepts an already-completed task when tracking creation with a void action', async () => {
    tasks.value = [makeTask('success')];
    await expect(runAndWaitForTask(async () => {}, 'bench', 'bench-1')).resolves.toMatchObject({ taskId: 'task-1' });
  });

  it.each(['success', 'failure', 'cancelled'] as const)('settles a later %s task', async (status) => {
    const promise = runAndWaitForTask(async () => true, 'bench', 'bench-1', /^Build bench/);
    const assertion = status === 'success'
      ? expect(promise).resolves.toMatchObject({ status })
      : expect(promise).rejects.toBeInstanceOf(status === 'failure' ? TaskFailedError : TaskCancelledError);
    await nextTick();
    tasks.value = [makeTask(status)];
    await assertion;
    expect(handledFailureTaskIds.has('task-1')).toBe(status === 'failure');
  });
});
