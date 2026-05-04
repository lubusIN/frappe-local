import { onMounted, onUnmounted, ref, watchEffect } from 'vue';
import type { LifecycleLogItem, SiteCreateInput, SiteListItem, SiteUpdateInput } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useSites = () => {
  const sites = ref<SiteListItem[]>([]);
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
      sites.value = await ipc.listSites();
    } catch (err) {
      error.value = String(err);
      sites.value = [];
    } finally {
      loading.value = false;
    }
  };

  const create = async (input: SiteCreateInput) => {
    creating.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const created = await ipc.createSite(input);
      sites.value = [created, ...sites.value];
      successMessage.value = `Created site ${created.name}.`;
    } catch (err) {
      error.value = String(err);
    } finally {
      creating.value = false;
    }
  };

  const update = async (id: string, input: SiteUpdateInput) => {
    updating.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const updated = await ipc.updateSite(id, input);

      if (!updated) {
        error.value = 'Unable to update site.';
        return;
      }

      sites.value = sites.value.map((site) => (site.id === id ? updated : site));
      successMessage.value = `Updated site ${updated.name}.`;
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
      await ipc.deleteSite(id);
      await load();
      successMessage.value = 'Site deletion started.';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = message.replace(/^Error invoking remote method '[^']*': /, '');
    } finally {
      deleting.value = false;
    }
  };

  const listLogs = async (id: string): Promise<LifecycleLogItem[]> => {
    loadingLogs.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      return await ipc.listSiteLogs(id);
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
      const opened = await ipc.openSiteFolder(id);
      if (!opened) {
        error.value = 'Unable to open site folder. Verify the path exists.';
        return;
      }
      successMessage.value = 'Site folder opened.';
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
    const hasQueued = sites.value.some((s) => s.status === 'queued');
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
    sites,
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
