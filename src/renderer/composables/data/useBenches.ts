import { ref } from 'vue';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';
import { useStatusPolling } from '@frappe-local/renderer/composables/system/useStatusPolling';
import type { BenchCreateInput, BenchListItem, BenchUpdateInput, LifecycleLogItem } from '@frappe-local/shared/core';

import { humanizeCreateFailure, stripIpcPrefix } from '@frappe-local/shared/core';

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
  const deletingIds = ref<Map<string, string>>(new Map());

  const load = async (silent = false) => {
    if (!silent) {
      loading.value = true;
    }
    error.value = null;

    try {
      const ipc = useIpc();
      const newList = await ipc.listBenches();

      // Check for completed deletions
      for (const [id] of deletingIds.value.entries()) {
        if (!newList.some((b) => b.id === id)) {
          deletingIds.value.delete(id);
        }
      }

      benches.value = newList;
    } catch (err) {
      error.value = String(err);
      benches.value = [];
    } finally {
      if (!silent) {
        loading.value = false;
      }
    }
  };

  const create = async (input: BenchCreateInput): Promise<BenchListItem | null> => {
    creating.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const created = await ipc.createBench(input);
      benches.value = [created, ...benches.value];
      // Toast will be shown when status changes from queued to running
      return created;
    } catch (err) {
      error.value = humanizeCreateFailure('bench', stripIpcPrefix(String(err)));
      return null;
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
      const isAppsOnlyUpdate =
        Array.isArray(input.apps) &&
        input.status === undefined &&
        input.name === undefined &&
        input.path === undefined &&
        input.frappeVersion === undefined &&
        input.httpPort === undefined;

      if (!isAppsOnlyUpdate && input.status !== 'running' && input.status !== 'stopped') {
        successMessage.value = `Updated bench ${updated.name}.`;
      }
    } catch (err) {
      error.value = stripIpcPrefix(String(err));
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
      const bench = benches.value.find((b) => b.id === id);
      if (bench) {
        deletingIds.value.set(id, bench.name);
      }

      const deleted = await ipc.deleteBench(id);
      if (deleted) {
        await load(true);
      } else {
        deletingIds.value.delete(id);
      }
    } catch (err) {
      deletingIds.value.delete(id);
      error.value = stripIpcPrefix(String(err));
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
      error.value = stripIpcPrefix(String(err));
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
      const bench = benches.value.find((b) => b.id === id);
      successMessage.value = bench ? `Bench ${bench.name} folder opened.` : 'Bench folder opened.';
    } catch (err) {
      error.value = stripIpcPrefix(String(err));
    } finally {
      openingFolder.value = false;
    }
  };

  const openShell = async (id: string) => {
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const opened = await ipc.openBenchShell(id);
      if (!opened) {
        error.value = 'Unable to open bench shell. Verify the bench is running.';
        return;
      }
      const bench = benches.value.find((b) => b.id === id);
      successMessage.value = bench ? `Shell opened for ${bench.name}.` : 'Bench shell opened.';
    } catch (err) {
      error.value = stripIpcPrefix(String(err));
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
      // Toast will be shown when the background task completes and status updates
    } catch (err) {
      error.value = stripIpcPrefix(String(err));
    } finally {
      updating.value = false;
    }
  };

  useStatusPolling(benches, deletingIds, load);

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
    openShell,
    cleanSites,
    refresh: load,
  };
};
