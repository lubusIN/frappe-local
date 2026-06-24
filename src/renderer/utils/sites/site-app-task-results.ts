import type { ProgressTaskSummary } from '@frappe-local/renderer/controllers/progress';

const SITE_APPS_TASK_NAME_PATTERN = /^(install|uninstall) app .* on /i;
const SITE_CREATION_TASK_NAME_PATTERN = 'create site ';

const isCompletedTask = (task: ProgressTaskSummary): boolean =>
  task.status === 'success' || task.status === 'failure';

export const isCompletedSiteCreationTask = (task: ProgressTaskSummary): boolean => {
  return (
    task.resource === 'site' &&
    task.taskName.toLowerCase().startsWith(SITE_CREATION_TASK_NAME_PATTERN) &&
    isCompletedTask(task)
  );
};

export const isCompletedSiteAppUpdateTask = (task: ProgressTaskSummary): boolean => {
  return (
    task.resource === 'site' &&
    SITE_APPS_TASK_NAME_PATTERN.test(task.taskName) &&
    isCompletedTask(task)
  );
};
