import { watch } from 'vue';
import { getProgressTasks, handledFailureTaskIds } from './useProgressCenter';
import type { ResourceType } from './useResourceTaskState';
import type { ProgressTaskSummary } from '@frappe-local/renderer/controllers';

export class TaskFailedError extends Error {
  constructor(public task: ProgressTaskSummary) {
    super(`${task.taskName} failed`);
    this.name = 'TaskFailedError';
  }
}

export class TaskCancelledError extends Error {
  constructor(public task: ProgressTaskSummary) {
    super(`${task.taskName} cancelled`);
    this.name = 'TaskCancelledError';
  }
}

/**
 * Runs an action and returns a promise that resolves when a background task matching the criteria completes successfully,
 * or rejects if the task fails.
 *
 * @param action The async function that triggers the background task
 * @param resourceType The type of resource ('bench' or 'site')
 * @param resourceId The ID of the resource
 * @param taskNamePattern Optional regex to match a specific task by name
 */
export const runAndWaitForTask = async <T>(
  action: () => Promise<T>,
  resourceType: ResourceType,
  resourceId: string,
  taskNamePattern?: RegExp,
  options?: { startTime?: number }
): Promise<ProgressTaskSummary> => {
  const tasks = getProgressTasks();
  const startTime = options?.startTime ?? Date.now();

  // Execute the action that triggers the task
  const started = await action();
  if (started === false || started === null) {
    throw new Error('The background operation could not be started.');
  }

  return new Promise((resolve, reject) => {
    // Helper to check if a task matches our criteria
    const matches = (t: ProgressTaskSummary) => {
      if (t.resource !== resourceType || t.resourceId !== resourceId) return false;
      if (taskNamePattern && !taskNamePattern.test(t.taskName)) return false;
      
      const taskCreatedAt = new Date(t.createdAt).getTime();
      // Allow a small grace period for clock skew between systems/IPC
      if (taskCreatedAt < startTime - 1000) return false;

      return t.status === 'success' || t.status === 'failure' || t.status === 'cancelled';
    };

    const settle = (task: ProgressTaskSummary) => {
      if (task.status === 'success') {
        resolve(task);
      } else if (task.status === 'cancelled') {
        reject(new TaskCancelledError(task));
      } else {
        handledFailureTaskIds.add(task.taskId);
        reject(new TaskFailedError(task));
      }
    };

    const existing = tasks.value.find(matches);
    if (existing) {
      settle(existing);
      return;
    }

    // Otherwise, wait for a matching task to complete
    const stop = watch(
      tasks,
      (currentTasks) => {
        const matching = currentTasks.find(matches);
        if (matching) {
          stop();
          settle(matching);
        }
      },
      { deep: true }
    );
  });
};
