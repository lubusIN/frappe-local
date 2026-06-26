/// <reference lib="dom" />

import { afterEach, describe, expect, it } from 'vitest';
import { useCustomApps } from '../../../src/renderer/composables/data/useCustomApps';
import type { CustomAppListItem, RendererBridge } from '../../../src/shared/core/ipc';

const makeCustomApp = (overrides: Partial<CustomAppListItem> = {}): CustomAppListItem => ({
  id: overrides.id ?? 'custom-1',
  name: overrides.name ?? 'custom_app',
  type: overrides.type ?? 'github',
  source: overrides.source ?? 'https://github.com/example/custom_app',
  createdAt: overrides.createdAt ?? '2026-06-07T08:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-06-07T08:00:00.000Z',
});

const installBridge = (bridge: Partial<RendererBridge>): void => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      frappeLocal: bridge,
    },
  });
};

describe('useCustomApps', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('keeps loading unchanged during silent refreshes', async () => {
    let resolveList: (apps: CustomAppListItem[]) => void = () => undefined;
    const listPromise = new Promise<CustomAppListItem[]>((resolve) => {
      resolveList = resolve;
    });

    installBridge({
      listCustomApps: async () => listPromise,
    });

    const customApps = useCustomApps();
    const refreshPromise = customApps.refresh(true);

    expect(customApps.loading.value).toBe(false);

    resolveList([makeCustomApp()]);
    await refreshPromise;

    expect(customApps.loading.value).toBe(false);
    expect(customApps.customApps.value).toHaveLength(1);
  });

  it('sets loading during normal refreshes', async () => {
    let resolveList: (apps: CustomAppListItem[]) => void = () => undefined;
    const listPromise = new Promise<CustomAppListItem[]>((resolve) => {
      resolveList = resolve;
    });

    installBridge({
      listCustomApps: async () => listPromise,
    });

    const customApps = useCustomApps();
    const refreshPromise = customApps.refresh();

    expect(customApps.loading.value).toBe(true);

    resolveList([makeCustomApp()]);
    await refreshPromise;

    expect(customApps.loading.value).toBe(false);
  });
});
