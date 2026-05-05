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

  const load = async (silent = false) => {
    if (!silent) {
      loading.value = true;
    }
    error.value = null;

    try {
      const ipc = useIpc();
      benches.value = await ipc.listBenches();
    } catch (err) {
      error.value = String(err);
      benches.value = [];
    } finally {
      if (!silent) {
        loading.value = false;
      }
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
      if (input.status === 'running') {
        successMessage.value = `Start requested for ${updated.name}.`;
      } else if (input.status === 'stopped') {
        successMessage.value = `Stop requested for ${updated.name}.`;
      } else {
        successMessage.value = `Updated bench ${updated.name}.`;
      }
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
      if (deleted) {
        await load();
        successMessage.value = 'Bench deletion started.';
      }
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

  const cleanSites = async (id: string) => {
    updating.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const cleaning = await ipc.cleanBenchSites(id);
      if (!cleaning) {
        error.value = 'Unable to clean bench. Verify the bench is running.';
        return;
      }
      successMessage.value = 'Bench cleaning task started.';
    } catch (err) {
      error.value = String(err);
    } finally {
      updating.value = false;
    }
  };

  const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollingInterval.value) return;
    pollingInterval.value = setInterval(() => {
      void load(true);
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
    cleanSites,
    refresh: load,
  };
};
