// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';
import { useBenches, useBenchesPolling } from '../../../src/renderer/composables/data/useBenches';
import { useSites, useSitesPolling } from '../../../src/renderer/composables/data/useSites';

enableAutoUnmount(afterEach);
afterEach(() => { vi.useRealTimers(); delete window.frappeLocal; });

const bench = { id: 'bench-1', name: 'Demo', status: 'stopped', apps: [] };
const site = { id: 'site-1', name: 'demo.localhost', benchId: 'bench-1', status: 'ready', apps: [] };
let bridge;
beforeEach(async () => {
  bridge = {
    listBenches: vi.fn().mockResolvedValue([]), listSites: vi.fn().mockResolvedValue([]),
    updateBench: vi.fn(), updateSite: vi.fn(), deleteBench: vi.fn(), deleteSite: vi.fn(),
  };
  window.frappeLocal = bridge;
  await useBenches().refresh();
  await useSites().refresh();
  vi.clearAllMocks();
});

describe('shared resource data', () => {
  it('preserves bench rows on refresh failure and recovers on the next success', async () => {
    const state = useBenches();
    bridge.listBenches.mockResolvedValueOnce([bench]);
    await state.refresh();
    bridge.listBenches.mockRejectedValueOnce(new Error('IPC unavailable'));
    await state.refresh(true);
    expect(state.benches.value).toEqual([bench]);
    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
    bridge.listBenches.mockResolvedValueOnce([{ ...bench, status: 'running' }]);
    await state.refresh(true);
    expect(state.benches.value[0].status).toBe('running');
    expect(state.error.value).toBeNull();
  });

  it('reports an initial load failure without leaving loading active', async () => {
    bridge.listBenches.mockRejectedValueOnce(new Error('IPC unavailable'));
    const state = useBenches();
    await state.refresh();
    expect(state.benches.value).toEqual([]);
    expect(state.error.value).toContain('IPC unavailable');
    expect(state.loading.value).toBe(false);
  });

  it.each([
    ['bench', useBenches, 'updateBench', 'deleteBench', bench],
    ['site', useSites, 'updateSite', 'deleteSite', site],
  ])('returns explicit start results for %s updates and deletions', async (_name, useResource, updateMethod, deleteMethod, item) => {
    const state = useResource();
    bridge[updateMethod].mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Cannot update')).mockResolvedValueOnce(item);
    expect(await state.update(item.id, { apps: ['erpnext'] })).toBe(false);
    expect(await state.update(item.id, { apps: ['erpnext'] })).toBe(false);
    expect(await state.update(item.id, { apps: ['erpnext'] })).toBe(true);
    bridge[deleteMethod].mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Cannot delete')).mockResolvedValueOnce(true);
    expect(await state.remove(item.id)).toBe(false);
    expect(await state.remove(item.id)).toBe(false);
    expect(await state.remove(item.id)).toBe(true);
  });

  it('runs one polling loop per resource regardless of consumer count and stops on unmount', async () => {
    vi.useFakeTimers();
    const Consumer = { setup() { useBenches(); useSites(); return () => h('span'); } };
    const Shell = { setup() {
      useBenchesPolling(); useSitesPolling();
      return () => h('div', [h(Consumer), h(Consumer), h(Consumer)]);
    } };
    const wrapper = mount(Shell);
    await flushPromises();
    expect(bridge.listBenches).toHaveBeenCalledTimes(1);
    expect(bridge.listSites).toHaveBeenCalledTimes(1);
    bridge.listBenches.mockResolvedValue([{ ...bench, status: 'queued' }]);
    bridge.listSites.mockResolvedValue([{ ...site, status: 'queued' }]);
    useBenches().benches.value = [{ ...bench, status: 'queued' }];
    useSites().sites.value = [{ ...site, status: 'queued' }];
    await flushPromises();
    expect(bridge.listBenches).toHaveBeenCalledTimes(2);
    expect(bridge.listSites).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(bridge.listBenches).toHaveBeenCalledTimes(3);
    expect(bridge.listSites).toHaveBeenCalledTimes(3);
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(6000);
    expect(bridge.listBenches).toHaveBeenCalledTimes(3);
    expect(bridge.listSites).toHaveBeenCalledTimes(3);
  });
});
