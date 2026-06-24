import { ref, watch, type Ref } from 'vue';
import type { ProgressTaskSummary } from '@frappe-local/renderer/controllers/progress';
import { formatStatus, statusTheme } from '@frappe-local/renderer/utils/format';

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
  const isAppsTask = (t: ProgressTaskSummary) => {
    const verb = String(t.taskName ?? '').toLowerCase().split(' ')[0] || '';
    return ['install', 'uninstall', 'get', 'remove'].includes(verb);
  };
  const getLatestTask = (resourceId: string) => findTask(resourceId);

  const isResourceBusy = (id: string) => Boolean(findTask(id, isActive));

  /**
   * Status label priority:
   * 1. Manual pending action (optimistic UI before task is registered)
   * 2. Latest active background task
   * 3. Static resource status from the data model
   */
  const formatStatusLabel = (row: TrackableResource) => {
    const pendingAction = getPendingAction(row.id);
    if (pendingAction === 'starting') return 'Starting';
    if (pendingAction === 'restarting') return 'Restarting';
    if (pendingAction === 'stopping') return 'Stopping';

    const task = getLatestTask(row.id);
    if (task && isActive(task)) {
      const name = String(task.taskName ?? '').toLowerCase();
      const verb = name.split(' ')[0];

      switch (verb) {
        case 'create': return 'Creating';
        case 'stop': return 'Stopping';
        case 'start': return 'Starting';
        case 'restart': return 'Restarting';
        case 'delete': return 'Deleting';
        case 'clean': return 'Cleaning';
        case 'install': return 'Installing';
        case 'uninstall': return 'Uninstalling';
        case 'get': return 'Getting app';
        case 'remove': return 'Removing app';
        default:
          return 'Processing';
      }
    }

    if (typeof row.status !== 'string' || row.status.length === 0) return 'Unknown';
    return formatStatus(row.status, 'resource');
  };

  const getStatusTheme = (row: TrackableResource) => {
    if (getPendingAction(row.id)) return 'blue';

    const task = getLatestTask(row.id);
    if (task && isActive(task)) return 'blue';
    
    return statusTheme(row.status, 'resource');
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
