import { onMounted, ref } from 'vue';
import type { SettingsItem } from '../../shared/ipc';
import { useIpc } from './useIpc';
import { DEFAULT_SETTINGS } from '../../shared/domain/models';

const defaultSettings = (): SettingsItem => ({ ...DEFAULT_SETTINGS });

export const useSettings = () => {
  const form = ref<SettingsItem>(defaultSettings());
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const load = async () => {
    loading.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      const settings = await ipc.getSettings();
      form.value = settings ?? defaultSettings();
    } catch (err) {
      error.value = String(err);
    } finally {
      loading.value = false;
    }
  };

  const save = async () => {
    saving.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      const saved = await ipc.setSettings({ ...form.value });
      form.value = saved;
    } catch (err) {
      error.value = String(err);
    } finally {
      saving.value = false;
    }
  };

  onMounted(() => {
    void load();
  });

  return {
    form,
    loading,
    saving,
    error,
    refresh: load,
    save,
  };
};
