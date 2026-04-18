import { onMounted, ref } from 'vue';
import type { SiteCreateInput, SiteListItem } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useSites = () => {
  const sites = ref<SiteListItem[]>([]);
  const loading = ref(false);
  const creating = ref(false);
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

  onMounted(() => {
    void load();
  });

  return {
    sites,
    loading,
    creating,
    error,
    successMessage,
    create,
    refresh: load,
  };
};
