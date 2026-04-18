import { onMounted, ref } from 'vue';
import type { SiteListItem, WorkspaceCreateInput, WorkspaceListItem, WorkspaceUpdateInput } from '../../shared/ipc';
import { useIpc } from './useIpc';

export const useWorkspaces = () => {
  const workspaces = ref<WorkspaceListItem[]>([]);
  const sites = ref<SiteListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const successMessage = ref<string | null>(null);

  const load = async () => {
    loading.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      workspaces.value = await ipc.listWorkspaces();
      sites.value = await ipc.listSites();
    } catch (err) {
      error.value = String(err);
      workspaces.value = [];
      sites.value = [];
    } finally {
      loading.value = false;
    }
  };

  const create = async (input: WorkspaceCreateInput) => {
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const created = await ipc.createWorkspace(input);
      workspaces.value = [...workspaces.value, created];
      successMessage.value = `Created workspace ${created.name}.`;
    } catch (err) {
      error.value = String(err);
    }
  };

  const update = async (id: string, input: WorkspaceUpdateInput) => {
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const updated = await ipc.updateWorkspace(id, input);
      if (!updated) {
        error.value = 'Unable to update workspace.';
        return;
      }
      workspaces.value = workspaces.value.map((workspace) => (workspace.id === id ? updated : workspace));
      successMessage.value = `Updated workspace ${updated.name}.`;
    } catch (err) {
      error.value = String(err);
    }
  };

  const remove = async (id: string) => {
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const deleted = await ipc.deleteWorkspace(id);
      if (!deleted) {
        error.value = 'Unable to delete workspace.';
        return;
      }

      workspaces.value = workspaces.value.filter((workspace) => workspace.id !== id);
      sites.value = sites.value.map((site) => (site.groupId === id ? { ...site, groupId: null } : site));
      successMessage.value = 'Workspace deleted.';
    } catch (err) {
      error.value = String(err);
    }
  };

  const assignSite = async (workspaceId: string, siteId: string) => {
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const updatedSite = await ipc.updateSite(siteId, { groupId: workspaceId });
      if (!updatedSite) {
        error.value = 'Unable to assign site to workspace.';
        return;
      }

      sites.value = sites.value.map((site) => (site.id === siteId ? updatedSite : site));
      await load();
      successMessage.value = 'Site assigned to workspace.';
    } catch (err) {
      error.value = String(err);
    }
  };

  const unassignSite = async (siteId: string) => {
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const updatedSite = await ipc.updateSite(siteId, { groupId: null });
      if (!updatedSite) {
        error.value = 'Unable to unassign site.';
        return;
      }

      sites.value = sites.value.map((site) => (site.id === siteId ? updatedSite : site));
      await load();
      successMessage.value = 'Site removed from workspace.';
    } catch (err) {
      error.value = String(err);
    }
  };

  onMounted(() => {
    void load();
  });

  return {
    workspaces,
    sites,
    loading,
    error,
    successMessage,
    create,
    update,
    remove,
    assignSite,
    unassignSite,
    refresh: load,
  };
};
