import { onMounted, ref } from 'vue';
import type { SettingsItem } from '../../../shared/core/ipc';
import { useIpc } from '../system/useIpc';
import { DEFAULT_SETTINGS } from '../../../shared/domain/models';

const defaultSettings = (): SettingsItem => ({ ...DEFAULT_SETTINGS });

export const useSettings = () => {
  const form = ref<SettingsItem>(defaultSettings());
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const configured = ref(false);
  const originalSettings = ref<SettingsItem | null>(null);

  const load = async () => {
    loading.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      const settings = await ipc.getSettings();
      configured.value = settings !== null;
      originalSettings.value = settings ? { ...settings } : null;

      if (settings) {
        form.value = { ...settings };
      } else {
        const resources = await ipc.getSystemResources();
        form.value = {
          ...defaultSettings(),
          podmanMemoryMb: resources.recommendedPodmanMemoryMb,
        };
      }
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
      originalSettings.value = { ...saved };
      form.value = { ...saved };
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
    configured,
    originalSettings,
    refresh: load,
    save,
  };
};
