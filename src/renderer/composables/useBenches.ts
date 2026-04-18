import { onMounted, ref } from 'vue';
import type { BenchListItem } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useBenches = () => {
  const benches = ref<BenchListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const load = async () => {
    loading.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      benches.value = await ipc.listBenches();
    } catch (err) {
      error.value = String(err);
      benches.value = [];
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    void load();
  });

  return {
    benches,
    loading,
    error,
    refresh: load,
  };
};
