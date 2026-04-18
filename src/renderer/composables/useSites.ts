import { onMounted, ref } from 'vue';
import type { SiteCreateInput, SiteListItem, SiteUpdateInput } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useSites = () => {
  const sites = ref<SiteListItem[]>([]);
  const loading = ref(false);
  const creating = ref(false);
  const updating = ref(false);
  const deleting = ref(false);
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
      const deleted = await ipc.deleteSite(id);

      if (!deleted) {
        error.value = 'Unable to delete site. Stop it before deleting.';
        return;
      }

      sites.value = sites.value.filter((site) => site.id !== id);
      successMessage.value = 'Site deleted.';
    } catch (err) {
      error.value = String(err);
    } finally {
      deleting.value = false;
    }
  };

  onMounted(() => {
    void load();
  });

  return {
    sites,
    loading,
    creating,
    updating,
    deleting,
    error,
    successMessage,
    create,
    update,
    remove,
    refresh: load,
  };
};
