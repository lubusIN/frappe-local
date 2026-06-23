import { onMounted, onUnmounted, ref } from 'vue';
import { useIpc } from './useIpc';

export const useFrontDoorStatus = () => {
  const isFrontDoorAvailable = ref(true);
  const isFrontDoorSecure = ref(false);
  let interval: ReturnType<typeof setInterval> | null = null;

  const fetchStatus = async () => {
    try {
      const ipc = useIpc();
      const status = await ipc.getFrontDoorStatus();
      isFrontDoorAvailable.value = status.available;
      isFrontDoorSecure.value = status.secure;
    } catch {
      // ignore
    }
  };

  onMounted(() => {
    void fetchStatus();
    interval = setInterval(() => {
      void fetchStatus();
    }, 5000);
  });

  onUnmounted(() => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  });

  return {
    isFrontDoorAvailable,
    isFrontDoorSecure,
  };
};
