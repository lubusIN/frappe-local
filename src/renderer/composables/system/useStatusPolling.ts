import { onMounted, onUnmounted, ref, watchEffect } from 'vue';

export const useStatusPolling = <T extends { status: string }>(
  items: { value: T[] },
  deletingIds: { value: { size: number } },
  loadFn: (silent?: boolean) => Promise<void>
) => {
  const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollingInterval.value) return;
    pollingInterval.value = setInterval(() => {
      void loadFn(true);
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value);
      pollingInterval.value = null;
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
