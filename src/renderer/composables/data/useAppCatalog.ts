import { onMounted, ref } from 'vue';
import type { CatalogAppItem } from '@frappe-local/shared/core';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';
import { useCustomApps } from '@frappe-local/renderer/composables/data/useCustomApps';

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export const useAppCatalog = () => {
  const state = ref<AsyncState<CatalogAppItem[]>>({ data: null, loading: false, error: null });
  const { customApps } = useCustomApps();

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
    const catalogApp = state.value.data?.find((app) => app.id === appId);
    if (catalogApp) return catalogApp;

    const customApp = customApps.value.find((app) => app.name === appId);
    if (customApp) {
      return {
        ...customApp,
        id: customApp.name,
        name: customApp.title || customApp.name,
      };
    }

    return { name: appId };
  };

  return { state, reload: load, getAppInfo };
};
