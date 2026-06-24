import { ref } from 'vue';
import { useStatusPolling } from '@frappe-local/renderer/composables/system/useStatusPolling';
import type { LifecycleLogItem, SiteCreateInput, SiteListItem, SiteUpdateInput } from '@frappe-local/shared/core/ipc';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';
import { humanizeCreateFailure, stripIpcPrefix } from '@frappe-local/shared/core/runtime-errors';

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
  const deletingIds = ref<Map<string, string>>(new Map());


  const load = async () => {
    const isInitialLoad = sites.value.length === 0;
    if (isInitialLoad) {
      loading.value = true;
      error.value = null;
    }

    try {
      const ipc = useIpc();
      const newList = await ipc.listSites();

      // Check for completed deletions
      for (const [id, name] of deletingIds.value.entries()) {
        if (!newList.some((s) => s.id === id)) {
          successMessage.value = `Site ${name} deleted.`;
          deletingIds.value.delete(id);
        }
      }

      // Remove the queued status transition checks, as the UI already shows specific
      // task completion toasts (like "Site created" or "App installed") via task watchers.

      sites.value = newList;
      if (!isInitialLoad) {
        // Clear stale load errors after successful background refresh.
        error.value = null;
      }
    } catch (err) {
      // Keep current rows rendered during background refresh failures.
      if (isInitialLoad) {
        error.value = String(err);
        sites.value = [];
      }
    } finally {
      if (isInitialLoad) {
        loading.value = false;
      }
    }
  };

  const create = async (input: SiteCreateInput) => {
    creating.value = true;
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const created = await ipc.createSite(input);
      if (created) {
        sites.value = [created, ...sites.value];
        return created;
      }
    } catch (err) {
      error.value = humanizeCreateFailure('site', stripIpcPrefix(String(err)));
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
      const isAppsOnlyUpdate =
        Array.isArray(input.apps) &&
        input.status === undefined &&
        input.name === undefined &&
        input.path === undefined &&
        input.benchId === undefined;

      if (!isAppsOnlyUpdate && input.status !== 'ready') {
        successMessage.value = `Updated site ${updated.name}.`;
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
      const site = sites.value.find((s) => s.id === id);
      if (site) {
        deletingIds.value.set(id, site.name);
      }

      await ipc.deleteSite(id);
      await load();
    } catch (err) {
      deletingIds.value.delete(id);
      const message = err instanceof Error ? err.message : String(err);
      error.value = stripIpcPrefix(message);
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
      const opened = await ipc.openSiteFolder(id);
      if (!opened) {
        error.value = 'Unable to open site folder. Verify the path exists.';
        return;
      }
      const site = sites.value.find((s) => s.id === id);
      successMessage.value = site ? `Site ${site.name} folder opened.` : 'Site folder opened.';
    } catch (err) {
      error.value = stripIpcPrefix(String(err));
    } finally {
      openingFolder.value = false;
    }
  };

  useStatusPolling(sites, deletingIds, load);

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
