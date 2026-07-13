import { ref } from 'vue';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';

const isEditorInstalled = ref<boolean>(true);
let checked = false;

export const useEditorStatus = () => {
  const checkStatus = async () => {
    try {
      const ipc = useIpc();
      isEditorInstalled.value = await ipc.checkEditorInstalled('code');
      checked = true;
    } catch {
      // Keep default if check fails temporarily
    }
  };

  if (!checked && typeof window !== 'undefined') {
    void checkStatus();
  }

  return {
    isEditorInstalled,
    checkStatus,
  };
};
