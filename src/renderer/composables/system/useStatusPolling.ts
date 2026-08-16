import { onMounted, onUnmounted, ref, watchEffect } from 'vue';

export const useStatusPolling = <T extends { status: string }>(
  items: { value: T[] },
  deletingIds: { value: { size: number } },
  loadFn: (silent?: boolean) => Promise<void>
) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isPolling = false;

  const poll = async () => {
    if (!isPolling) return;
    try {
      await loadFn(true);
    } catch {
      // ignore
    } finally {
      if (isPolling) {
        timer = setTimeout(poll, 3000);
      }
    }
  };

  const startPolling = () => {
    if (isPolling) return;
    isPolling = true;
    poll();
  };

  const stopPolling = () => {
    isPolling = false;
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
