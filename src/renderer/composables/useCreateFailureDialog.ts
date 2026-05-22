import { computed, ref, watch } from 'vue';
import type { ProgressTaskSummary } from '../progress-center';

export function useCreateFailureDialog(tasks: { value: ProgressTaskSummary[] }, prefix: string) {
  const failedTaskId = ref<string | null>(null);

  const failureTask = computed(() => {
    if (!failedTaskId.value) return null;
    return tasks.value.find((t) => t.taskId === failedTaskId.value) || null;
  });

  const failureDialogTitle = computed(() => {
    const defaultTitle = `${prefix} creation failed`;
    if (!failureTask.value) return defaultTitle;
    return failureTask.value.taskName || defaultTitle;
  });

  const failureDialogBody = computed(() => {
    if (!failureTask.value) return 'An unknown error occurred.';
    return failureTask.value.message || 'The task failed without providing a reason.';
  });

  const isFailureDialogOpen = computed({
    get: () => Boolean(failedTaskId.value),
    set: (val) => {
      if (!val) failedTaskId.value = null;
    },
  });

  const handleCreated = (taskId?: string) => {
    if (!taskId) return;
    const unwatch = watch(
      () => tasks.value,
      (newTasks) => {
        const task = newTasks.find((t) => t.taskId === taskId);
        if (task && task.status === 'failure') {
          failedTaskId.value = taskId;
          unwatch();
        } else if (task && task.status === 'success') {
          unwatch();
        }
      },
      { immediate: true, deep: true }
    );
  };

  return {
    failedTaskId,
    failureTask,
    failureDialogTitle,
    failureDialogBody,
    isFailureDialogOpen,
    handleCreated,
  };
}
