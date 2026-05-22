import { computed, onMounted, onUnmounted, reactive, toRefs } from 'vue';
import {
  createDefaultProgressCenterState,
  createProgressCenterController,
  filterProgressTasks,
} from '../progress-center';
import { useIpc } from './useIpc';

// Global singleton state to avoid multiple IPC subscriptions
const globalState = reactive(createDefaultProgressCenterState());
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

  return {
    ...toRefs(globalState),
    filteredTasks,
    reconnect,
    acknowledgedTasks,
  };
};
