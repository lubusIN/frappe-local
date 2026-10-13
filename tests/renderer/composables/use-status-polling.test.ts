import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useStatusPolling } from '../../../src/renderer/composables/system/useStatusPolling';

const lifecycle = vi.hoisted(() => ({ unmount: () => {} }));
vi.mock('vue', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: vi.fn(),
  onUnmounted: (callback: () => void) => { lifecycle.unmount = callback; },
}));

afterEach(() => {
  lifecycle.unmount();
  vi.useRealTimers();
});

describe('status polling', () => {
  it('does not let an older in-flight request start a second loop after restart', async () => {
    vi.useFakeTimers();
    let finishOldRequest!: () => void;
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishOldRequest = resolve; }))
      .mockResolvedValue(undefined);
    const items = ref([{ status: 'queued' }]);
    const scope = effectScope();
    scope.run(() => useStatusPolling(items, ref(new Map()), load));
    items.value = [];
    await nextTick();
    items.value = [{ status: 'queued' }];
    await nextTick();
    finishOldRequest();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(3);
    lifecycle.unmount();
    scope.stop();
    await vi.advanceTimersByTimeAsync(6000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('retries failures and stops when no queued or deleting resources remain', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValue(new Error('temporarily unavailable'));
    const deleting = ref(new Map([['site-1', 'Demo']]));
    const scope = effectScope();
    scope.run(() => useStatusPolling(ref([]), deleting, load));
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(2);
    deleting.value.clear();
    await nextTick();
    await vi.advanceTimersByTimeAsync(6000);
    expect(load).toHaveBeenCalledTimes(2);
    scope.stop();
  });
});
