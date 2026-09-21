import { onMounted, onUnmounted, watchEffect } from 'vue';

export const useStatusPolling = <T extends { status: string }>(
  items: { value: T[] },
  deletingIds: { value: { size: number } },
  loadFn: (silent?: boolean) => Promise<void>
) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isPolling = false;
  let generation = 0;

  const poll = async (pollGeneration: number) => {
    if (!isPolling || pollGeneration !== generation) return;
    try {
      await loadFn(true);
    } catch {
      // ignore
    } finally {
      if (isPolling && pollGeneration === generation) {
        timer = setTimeout(() => poll(pollGeneration), 3000);
      }
    }
  };

  const startPolling = () => {
    if (isPolling) return;
    isPolling = true;
    void poll(++generation);
  };

  const stopPolling = () => {
    isPolling = false;
    generation += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  watchEffect(() => {
    const hasQueued = items.value.some((item) => item.status === 'queued');
    const hasDeleting = deletingIds.value.size > 0;
    if (hasQueued || hasDeleting) {
      startPolling();
    } else {
      stopPolling();
    }
  });

  onMounted(() => {
    void loadFn();
  });

  onUnmounted(() => {
    stopPolling();
  });

  return { startPolling, stopPolling };
};
