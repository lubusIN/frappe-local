import { onMounted, ref } from 'vue';
import type { CustomAppListItem } from '@frappe-local/shared/core';
import type { CreateCustomAppInput, UpdateCustomAppInput } from '@frappe-local/shared/domain';
import { useIpc } from '@frappe-local/renderer/composables/system';

export const useCustomApps = () => {
  const customApps = ref<CustomAppListItem[]>([]);
  const loading = ref(false);
  const updating = ref(false);
  const deleting = ref(false);
  const error = ref<string | null>(null);
  const successMessage = ref<string | null>(null);

  const ipc = useIpc();

  const load = async () => {
    loading.value = true;
    error.value = null;
    try {
      customApps.value = await ipc.listCustomApps();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  };

  const create = async (input: CreateCustomAppInput) => {
    updating.value = true;
    error.value = null;
    try {
      const created = await ipc.createCustomApp(input);
      successMessage.value = `Created custom app ${created.name}`;
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
        successMessage.value = `Updated custom app ${updated.name}`;
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

  const refresh = async (silent = false) => {
    if (!silent) {
      loading.value = true;
    }
    await load();
  };

  onMounted(() => {
    void load();
  });

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
    refresh,
  };
};
