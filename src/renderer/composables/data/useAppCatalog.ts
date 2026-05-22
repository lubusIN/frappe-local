import { ref, onMounted } from 'vue';
import type { CatalogAppItem } from '../../../shared/core/ipc';
import { useIpc } from '../system/useIpc';

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export const useAppCatalog = () => {
  const state = ref<AsyncState<CatalogAppItem[]>>({ data: null, loading: false, error: null });

  const load = async (query = '') => {
    state.value = { data: null, loading: true, error: null };
    try {
      const ipc = useIpc();
      const items = query ? await ipc.searchCatalog(query) : await ipc.listCatalog();
      state.value = { data: items, loading: false, error: null };
    } catch (err) {
      state.value = { data: null, loading: false, error: String(err) };
    }
  };

  onMounted(() => { void load(); });

  const getAppInfo = (appId: string) => {
    return state.value.data?.find((app) => app.id === appId) || { name: appId };
  };

  return { state, reload: load, getAppInfo };
};
