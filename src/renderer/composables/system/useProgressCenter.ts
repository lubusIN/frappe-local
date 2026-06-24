import { computed, onMounted, onUnmounted, reactive, toRefs, watch } from 'vue';
import {
  createDefaultProgressCenterState,
  createProgressCenterController,
  filterProgressTasks,
  reconcileSavedProgressTasks,
  type ProgressTaskSummary,
} from '@frappe-local/renderer/controllers/progress';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';

export const ACTIVITIES_STORAGE_KEY = 'frappe-local:activities';
export const ACKNOWLEDGED_TASKS_KEY = 'frappe-local:acknowledged-tasks';

const loadSavedTasks = () => {
  try {
    const saved = localStorage.getItem(ACTIVITIES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return reconcileSavedProgressTasks(parsed as ProgressTaskSummary[]);
      }
    }
  } catch (err) {
    console.error('Failed to parse saved activities:', err);
  }
  return [];
};

// Global singleton state to avoid multiple IPC subscriptions
const initialState = createDefaultProgressCenterState();
initialState.tasks = loadSavedTasks();
const globalState = reactive(initialState);

watch(() => globalState.tasks, (tasks) => {
  try {
    localStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error('Failed to save activities:', err);
  }
}, { deep: true });

const loadAcknowledgedTasks = () => {
  try {
    const saved = localStorage.getItem(ACKNOWLEDGED_TASKS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set<string>(parsed);
      }
    }
  } catch (err) {
    console.error('Failed to parse acknowledged tasks:', err);
  }
  return new Set<string>();
};

const acknowledgedTasks = reactive(loadAcknowledgedTasks());

watch(acknowledgedTasks, (tasks) => {
  try {
    localStorage.setItem(ACKNOWLEDGED_TASKS_KEY, JSON.stringify(Array.from(tasks)));
  } catch (err) {
    console.error('Failed to save acknowledged tasks:', err);
  }
}, { deep: true });
let globalController: ReturnType<typeof createProgressCenterController> | null = null;
let connectionCount = 0;

export const useProgressCenter = () => {
  if (!globalController) {
    globalController = createProgressCenterController(useIpc(), globalState);
  }

  onMounted(async () => {
    connectionCount++;
    if (connectionCount === 1) {
      await globalController?.connect();
    }
  });

  onUnmounted(async () => {
    connectionCount--;
    if (connectionCount === 0) {
      await globalController?.disconnect();
    }
  });

  const filteredTasks = computed(() => filterProgressTasks(globalState));

  const reconnect = async (): Promise<void> => {
    await globalController?.disconnect();
    await globalController?.connect();
  };

  const clearTasks = () => {
    globalState.tasks = [];
    acknowledgedTasks.clear();
    localStorage.removeItem(ACTIVITIES_STORAGE_KEY);
    localStorage.removeItem(ACKNOWLEDGED_TASKS_KEY);
  };

  return {
    ...toRefs(globalState),
    filteredTasks,
    reconnect,
    acknowledgedTasks,
    clearTasks,
  };
};
