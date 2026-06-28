import { getCurrentInstance, onMounted, ref } from 'vue';
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
  const { customApps, refresh: refreshCustomApps } = useCustomApps();

  const load = async (query = '') => {
    state.value = { data: null, loading: true, error: null };
    try {
      const ipc = useIpc();
      const [items] = await Promise.all([
        query ? ipc.searchCatalog(query) : ipc.listCatalog(),
        refreshCustomApps(true),
      ]);
      state.value = { data: items, loading: false, error: null };
    } catch (err) {
      state.value = { data: null, loading: false, error: String(err) };
    }
  };

  if (getCurrentInstance()) {
    onMounted(() => { void load(); });
  }

  const getAppInfo = (appId: string) => {
    const catalogApp = state.value.data?.find((app) => app.id === appId);
    if (catalogApp) return catalogApp;

    const customApp = customApps.value.find((app) => app.id === appId);
    if (customApp) {
      return {
        ...customApp,
        id: customApp.id,
        name: customApp.title || customApp.name,
        slug: customApp.name,
      };
    }

    return { name: appId };
  };

  const getAppTitle = (appId: string): string => {
    const info = getAppInfo(appId);
    return (info as any).title || info.name || appId;
  };

  const formatTaskTitle = (taskName?: string | null): string => {
    if (!taskName) return '';
    return taskName.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (match) => {
      const title = getAppTitle(match);
      return title !== match ? title : match;
    });
  };

  return { state, reload: load, getAppInfo, getAppTitle, formatTaskTitle };
};
