import { onMounted, ref } from 'vue';
import type { WorkspaceListItem } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useWorkspaces = () => {
  const workspaces = ref<WorkspaceListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const load = async () => {
    loading.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      workspaces.value = await ipc.listWorkspaces();
    } catch (err) {
      error.value = String(err);
      workspaces.value = [];
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    void load();
  });

  return {
    workspaces,
    loading,
    error,
    refresh: load,
  };
};
