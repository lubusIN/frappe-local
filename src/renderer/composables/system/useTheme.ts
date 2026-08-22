import { onMounted, watch } from 'vue';
import { useSettings } from '@frappe-local/renderer/composables/data/useSettings';
import { useColorScheme } from 'frappe-ui';

export const useTheme = () => {
  const { form, configured, refresh } = useSettings();
  const { setColorScheme } = useColorScheme();

  onMounted(() => {
    // Initial fetch to get the current settings
    if (!configured.value) {
      void refresh();
    }
    
    // Apply initial theme from Electron settings instead of localStorage
    setColorScheme((form.value?.theme as 'light' | 'dark' | 'system') ?? 'system');
  });

  // Keep frappe-ui theme in sync if settings change externally
  watch(
    () => form.value?.theme,
    (newTheme) => {
      setColorScheme((newTheme as 'light' | 'dark' | 'system') ?? 'system');
    }
  );
};
