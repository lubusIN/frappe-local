import { ref, watch, type Ref } from 'vue';
import type { ProgressTaskSummary } from '../../controllers/progress';

export type ResourceType = 'bench' | 'site';

export type TrackableResource = {
  id: string;
  status: string;
};

export const useResourceTaskState = (resourceType: ResourceType, tasks: Ref<ProgressTaskSummary[]>) => {
  const pendingActions = ref<Record<string, string>>({});

  const setPendingAction = (id: string, action: string) => {
    pendingActions.value = { ...pendingActions.value, [id]: action };
  };

  const getPendingAction = (id: string) => pendingActions.value[id];

  const clearPendingAction = (id: string) => {
    if (!pendingActions.value[id]) return;
    const next = { ...pendingActions.value };
    delete next[id];
    pendingActions.value = next;
  };

  // Auto-clear manual pending actions once the real task registry takes over
  watch(
    tasks,
    (currentTasks) => {
      for (const id of Object.keys(pendingActions.value)) {
        if (currentTasks.some((t) => t.resourceId === id && t.resource === resourceType)) {
          clearPendingAction(id);
        }
      }
    },
    { deep: true }
  );

  // Shared helper to find a task matching this resource with an optional predicate
  const findTask = (resourceId: string, predicate?: (t: ProgressTaskSummary) => boolean) =>
    tasks.value.find(
      (t) => t.resourceId === resourceId && t.resource === resourceType && (!predicate || predicate(t))
    );

  const isActive = (t: ProgressTaskSummary) => t.status === 'running' || t.status === 'queued';
  const isFinished = (t: ProgressTaskSummary) => t.status === 'success' || t.status === 'failure';
  const isAppsTask = (t: ProgressTaskSummary) => t.taskName.toLowerCase().includes(`update ${resourceType} apps`);

  const isResourceBusy = (id: string) => Boolean(findTask(id, isActive));

  /**
   * Status label priority:
   * 1. Manual pending action (optimistic UI before task is registered)
   * 2. Failed app-update task (shows install error state)
   * 3. Active background task (shows current step)
   * 4. Static resource status from the data model
   */
  const formatStatusLabel = (row: TrackableResource) => {
    const pendingAction = getPendingAction(row.id);
    if (pendingAction === 'starting') return 'Starting';
    if (pendingAction === 'restarting') return 'Restarting';
    if (pendingAction === 'stopping') return 'Stopping';

    const failedAppTask = findTask(row.id, (t) => t.status === 'failure' && isAppsTask(t));
    if (failedAppTask) {
      const failureMessage = String(failedAppTask.message ?? '').toLowerCase();
      if (failureMessage.includes('cancelled')) return 'Install cancelled';
      if (failureMessage.includes('timed out')) return 'Install timed out';
      return 'Install failed';
    }

    const task = findTask(row.id, isActive);
    if (task) {
      const name = String(task.taskName ?? '').toLowerCase();
      if (name.includes(`create ${resourceType}`)) return 'Creating';
      if (name.includes(`update ${resourceType} apps`)) {
        const stepName = String(task.stepName ?? '').toLowerCase();
        if (stepName.includes('install')) return 'Installing';
        if (stepName.includes('remov')) return 'Removing apps';
        if (stepName.includes('migrate')) return 'Migrating';
        return 'Installing';
      }
      if (name.includes(`restart ${resourceType}`)) return 'Restarting';
      if (name.includes(`start ${resourceType}`)) return 'Starting';
      if (name.includes(`stop ${resourceType}`)) return 'Stopping';
      if (name.includes(`delete ${resourceType}`)) return 'Deleting';
      if (name.includes(`clean ${resourceType}`)) return 'Cleaning';
      
      return typeof task.stepName === 'string' && task.stepName.length > 0
        ? task.stepName.replace(/\.\.\./g, '')
        : 'Processing';
    }

    if (row.status === 'running') return 'Running';
    if (row.status === 'stopped') return 'Stopped';
    if (row.status === 'queued') return 'In Progress';
    if (row.status === 'failure') return 'Failed';
    return typeof row.status === 'string' && row.status.length > 0 ? row.status : 'Unknown';
  };

  const getStatusTheme = (row: TrackableResource) => {
    if (getPendingAction(row.id)) return 'blue';
    if (isResourceBusy(row.id)) return 'blue';

    const failedAppTask = findTask(row.id, (t) => t.status === 'failure' && isAppsTask(t));
    if (failedAppTask) return String(failedAppTask.message ?? '').toLowerCase().includes('cancelled') ? 'gray' : 'red';
    
    const status = row.status;
    if (status === 'running') return 'green';
    if (status === 'stopped') return 'gray';
    if (status === 'queued') return 'blue';
    if (status === 'failure') return 'red';
    return 'gray';
  };

  // Prioritize: active apps task > any active task > completed apps task > any completed task
  const getLatestRelevantTaskId = (resourceId: string): string | null => {
    const activeApps = findTask(resourceId, (t) => isAppsTask(t) && isActive(t));
    if (activeApps) return activeApps.taskId;

    const active = findTask(resourceId, isActive);
    if (active) return active.taskId;

    const completedApps = findTask(resourceId, (t) => isAppsTask(t) && isFinished(t));
    if (completedApps) return completedApps.taskId;

    return findTask(resourceId, isFinished)?.taskId ?? null;
  };

  return {
    setPendingAction,
    getPendingAction,
    clearPendingAction,
    isResourceBusy,
    formatStatusLabel,
    getStatusTheme,
    getLatestRelevantTaskId,
  };
};
