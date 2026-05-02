import { onMounted, onUnmounted, ref, watchEffect } from 'vue';
import type { BenchCreateInput, BenchListItem, BenchUpdateInput, LifecycleLogItem } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useBenches = () => {
  const benches = ref<BenchListItem[]>([]);
  const loading = ref(false);
  const creating = ref(false);
  const updating = ref(false);
  const deleting = ref(false);
  const loadingLogs = ref(false);
  const openingFolder = ref(false);
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

  const update = async (id: string, input: BenchUpdateInput) => {
    updating.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const updated = await ipc.updateBench(id, input);

      if (!updated) {
        error.value = 'Unable to update bench.';
        return;
      }

      benches.value = benches.value.map((bench) => (bench.id === id ? updated : bench));
      successMessage.value = `Updated bench ${updated.name}.`;
    } catch (err) {
      error.value = String(err);
    } finally {
      updating.value = false;
    }
  };

  const remove = async (id: string) => {
    deleting.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const deleted = await ipc.deleteBench(id);

      if (!deleted) {
        error.value = 'Unable to delete bench. Stop it and remove attached sites first.';
        return;
      }

      benches.value = benches.value.filter((bench) => bench.id !== id);
      successMessage.value = 'Bench deleted.';
    } catch (err) {
      error.value = String(err);
    } finally {
      deleting.value = false;
    }
  };

  const listLogs = async (id: string): Promise<LifecycleLogItem[]> => {
    loadingLogs.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      return await ipc.listBenchLogs(id);
    } catch (err) {
      error.value = String(err);
      return [];
    } finally {
      loadingLogs.value = false;
    }
  };

  const openFolder = async (id: string) => {
    openingFolder.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const opened = await ipc.openBenchFolder(id);
      if (!opened) {
        error.value = 'Unable to open bench folder. Verify the path exists.';
        return;
      }
      successMessage.value = 'Bench folder opened.';
    } catch (err) {
      error.value = String(err);
    } finally {
      openingFolder.value = false;
    }
  };

  const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollingInterval.value) return;
    pollingInterval.value = setInterval(() => {
      void load();
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value);
      pollingInterval.value = null;
    }
  };

  watchEffect(() => {
    const hasQueued = benches.value.some((b) => b.status === 'queued');
    if (hasQueued) {
      startPolling();
    } else {
      stopPolling();
    }
  });

  onMounted(() => {
    void load();
  });

  onUnmounted(() => {
    stopPolling();
  });

  return {
    benches,
    loading,
    creating,
    updating,
    deleting,
    loadingLogs,
    openingFolder,
    error,
    successMessage,
    create,
    update,
    remove,
    listLogs,
    openFolder,
    refresh: load,
  };
};
