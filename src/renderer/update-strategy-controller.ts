import { computed, ref } from 'vue';
import type { RendererBridge, UpdateCheckResult, UpdateStrategyStatus } from '../shared/ipc';
import { createRendererLogger } from './logger';

const updateLogger = createRendererLogger('update-strategy');

export const useUpdateStrategy = (bridge: RendererBridge) => {
  const status = ref<UpdateStrategyStatus | null>(null);
  const lastCheck = ref<UpdateCheckResult | null>(null);
  const loading = ref(false);
  const checking = ref(false);
  const error = ref<string | null>(null);

  const load = async (): Promise<void> => {
    loading.value = true;
    error.value = null;

    try {
      status.value = await bridge.getUpdateStatus();
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : String(loadError);
      updateLogger.error(`failed to load update status: ${error.value}`);
    } finally {
      loading.value = false;
    }
  };

  const checkNow = async (): Promise<void> => {
    checking.value = true;
    error.value = null;

    try {
      lastCheck.value = await bridge.checkForUpdates();
    } catch (checkError) {
      error.value = checkError instanceof Error ? checkError.message : String(checkError);
      updateLogger.error(`failed to run update check: ${error.value}`);
    } finally {
      checking.value = false;
    }
  };

  return {
    status: computed(() => status.value),
    lastCheck: computed(() => lastCheck.value),
    loading: computed(() => loading.value),
    checking: computed(() => checking.value),
    error: computed(() => error.value),
    load,
    checkNow,
  };
};
