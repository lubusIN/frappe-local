import { onMounted, watch } from 'vue';
import { useSettings } from '@frappe-local/renderer/composables/data';
import { useTheme as useFrappeTheme } from 'frappe-ui';

export const useTheme = () => {
  const { form, configured, refresh } = useSettings();
  const { setTheme } = useFrappeTheme();

  onMounted(() => {
    // Initial fetch to get the current settings
    if (!configured.value) {
      void refresh();
    }
    
    // Apply initial theme from Electron settings instead of localStorage
    setTheme((form.value?.theme as 'light' | 'dark' | 'system') ?? 'system');
  });

  // Keep frappe-ui theme in sync if settings change externally
  watch(
    () => form.value?.theme,
    (newTheme) => {
      setTheme((newTheme as 'light' | 'dark' | 'system') ?? 'system');
    }
  );
};
