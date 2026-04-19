import { computed, onMounted, onUnmounted, reactive, toRefs } from 'vue';
import {
  createDefaultProgressCenterState,
  createProgressCenterController,
  filterProgressTasks,
} from '../progress-center';
import { useIpc } from './useIpc';

export const useProgressCenter = () => {
  const state = reactive(createDefaultProgressCenterState());
  const controller = createProgressCenterController(useIpc(), state);

  onMounted(() => {
    void controller.connect();
  });

  onUnmounted(() => {
    void controller.disconnect();
  });

  const filteredTasks = computed(() => filterProgressTasks(state));

  const reconnect = async (): Promise<void> => {
    await controller.disconnect();
    await controller.connect();
  };

  return {
    ...toRefs(state),
    filteredTasks,
    reconnect,
  };
};
