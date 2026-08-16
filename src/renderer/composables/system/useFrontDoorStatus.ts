import { onMounted, onUnmounted, ref } from 'vue';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';

export const useFrontDoorStatus = () => {
  const isFrontDoorAvailable = ref(true);
  const isFrontDoorSecure = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isStopped = false;

  const fetchStatus = async () => {
    try {
      const ipc = useIpc();
      const status = await ipc.getFrontDoorStatus();
      isFrontDoorAvailable.value = status.available;
      isFrontDoorSecure.value = status.secure;
    } catch {
      // ignore
    } finally {
      if (!isStopped) {
        timer = setTimeout(fetchStatus, 5000);
      }
    }
  };

  onMounted(() => {
    void fetchStatus();
  });

  onUnmounted(() => {
    isStopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  return {
    isFrontDoorAvailable,
    isFrontDoorSecure,
  };
};
