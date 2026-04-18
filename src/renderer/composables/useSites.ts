import { onMounted, ref } from 'vue';
import type { SiteListItem } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useSites = () => {
  const sites = ref<SiteListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  onMounted(() => {
    void load();
  });

  return {
    sites,
    loading,
    error,
    refresh: load,
  };
};
