import { onMounted, ref } from 'vue';
import type { BenchCreateInput, BenchListItem } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useBenches = () => {
  const benches = ref<BenchListItem[]>([]);
  const loading = ref(false);
  const creating = ref(false);
  const error = ref<string | null>(null);
  const successMessage = ref<string | null>(null);

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

  const create = async (input: BenchCreateInput) => {
    creating.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const created = await ipc.createBench(input);
      benches.value = [created, ...benches.value];
      successMessage.value = `Created bench ${created.name}.`;
    } catch (err) {
      error.value = String(err);
    } finally {
      creating.value = false;
    }
  };

  onMounted(() => {
    void load();
  });

  return {
    benches,
    loading,
    creating,
    error,
    successMessage,
    create,
    refresh: load,
  };
};
