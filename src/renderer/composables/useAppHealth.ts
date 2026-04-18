import { ref, onMounted } from 'vue';
import { useIpc } from './useIpc';

export type AppHealthState = {
  appName: string;
  platform: string;
  nodeVersion: string;
  electronVersion: string;
  timestamp: string;
} | null;

export const useAppHealth = () => {
  const health = ref<AppHealthState>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const check = async () => {
    loading.value = true;
    error.value = null;
    try {
      const ipc = useIpc();
      health.value = await ipc.checkAppHealth();
    } catch (err) {
      error.value = String(err);
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => { void check(); });

  return { health, loading, error, refresh: check };
};
