import { computed, onMounted, onUnmounted, reactive, toRefs, watch } from 'vue';
import {
  createDefaultProgressCenterState,
  createProgressCenterController,
  filterProgressTasks,
} from '../../controllers/progress';
import { useIpc } from './useIpc';

export const ACTIVITIES_STORAGE_KEY = 'local-bench:activities';

const loadSavedTasks = () => {
  try {
    const saved = localStorage.getItem(ACTIVITIES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
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

const acknowledgedTasks = reactive(new Set<string>());
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
    localStorage.removeItem(ACTIVITIES_STORAGE_KEY);
  };

  return {
    ...toRefs(globalState),
    filteredTasks,
    reconnect,
    acknowledgedTasks,
    clearTasks,
  };
};
