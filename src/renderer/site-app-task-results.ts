import type { ProgressTaskSummary } from './progress-center';

const SITE_APPS_TASK_NAME_PATTERN = 'update site apps';

export const isCompletedSiteAppUpdateTask = (task: ProgressTaskSummary): boolean => {
  return (
    task.resource === 'site' &&
    task.taskName.toLowerCase().includes(SITE_APPS_TASK_NAME_PATTERN) &&
    (task.status === 'success' || task.status === 'failure')
  );
};