import { getCurrentInstance, onMounted, ref } from 'vue';
import type { CustomAppListItem } from '@frappe-local/shared/core';
import { stripIpcPrefix } from '@frappe-local/shared/core';
import type { CreateCustomAppInput, UpdateCustomAppInput } from '@frappe-local/shared/domain';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';

const customApps = ref<CustomAppListItem[]>([]);
const loading = ref(false);
const updating = ref(false);
const deleting = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);

export const useCustomApps = () => {

  const ipc = useIpc();

  const load = async (silent = false) => {
    if (!silent) {
      loading.value = true;
    }
    error.value = null;
    try {
      customApps.value = await ipc.listCustomApps();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (!silent) {
        loading.value = false;
      }
    }
  };

  const create = async (input: CreateCustomAppInput) => {
    updating.value = true;
    error.value = null;
    try {
      const created = await ipc.createCustomApp(input);
      successMessage.value = `Created custom app ${created.title || created.name}`;
      await load();
      return created;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      updating.value = false;
    }
  };

  const update = async (id: string, input: UpdateCustomAppInput) => {
    updating.value = true;
    error.value = null;
    try {
      const updated = await ipc.updateCustomApp(id, input);
      if (updated) {
        successMessage.value = `Updated custom app ${updated.title || updated.name}`;
        await load();
      }
      return updated;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      updating.value = false;
    }
  };

  const checkAppUsage = async (id: string) => {
    try {
      const app = customApps.value.find(a => a.id === id);
      if (!app) return { inUse: false, benches: [], sites: [] };
      
      const identifiers = [app.id, app.name];
      if (app.title && !identifiers.includes(app.title)) {
        identifiers.push(app.title);
      }
      
      return await ipc.checkAppUsage(identifiers);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  };

  const remove = async (id: string) => {
    deleting.value = true;
    error.value = null;
    try {
      const success = await ipc.deleteCustomApp(id);
      if (success) {
        successMessage.value = `Deleted custom app`;
        await load();
      }
      return success;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      deleting.value = false;
    }
  };

  if (getCurrentInstance()) {
    onMounted(() => {
      void load();
    });
  }

  const openInEditor = async (appName: string, inContainer = false) => {
    error.value = null;
    successMessage.value = null;

    try {
      const ipc = useIpc();
      const opened = await ipc.openAppInEditor(null, appName, inContainer);
      if (customApps.value.length === 0) {
        await load(true);
      }
      const appItem = customApps.value.find((a) => a.id === appName || a.name === appName || a.title === appName);
      const appTitle = appItem?.title || appItem?.name || appName;
      if (!opened) {
        error.value = inContainer
          ? `Unable to open app ${appTitle} in Dev Container. Verify a bench with this app is running.`
          : `Unable to open app ${appTitle} in VS Code. Verify VS Code ("code" CLI) is installed and path exists.`;
        return;
      }
      successMessage.value = `${inContainer ? 'Dev Container' : 'VS Code'} opened for app ${appTitle}.`;
    } catch (err) {
      error.value = stripIpcPrefix(String(err));
    }
  };

  return {
    customApps,
    loading,
    updating,
    deleting,
    error,
    successMessage,
    create,
    update,
    remove,
    checkAppUsage,
    openInEditor,
    refresh: load,
  };
};
