import { onMounted, onUnmounted, reactive, toRefs } from 'vue';
import type { RuntimeRepairInput } from '../../shared/ipc';
import { createDefaultRuntimeHealthState, createRuntimeHealthController } from '../runtime-health-controller';
import { useIpc } from './useIpc';

export const useRuntimeHealth = () => {
  const state = reactive(createDefaultRuntimeHealthState());
  const controller = createRuntimeHealthController(useIpc(), state);

  onMounted(() => {
    void controller.connect();
    void controller.refresh();
  });

  onUnmounted(() => {
    void controller.disconnect();
  });

  const repair = async (input: RuntimeRepairInput = {}): Promise<void> => {
    await controller.repair(input);
  };

  return {
    ...toRefs(state),
    refresh: controller.refresh,
    repair,
  };
};