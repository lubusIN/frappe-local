/// <reference lib="dom" />

import { afterEach, describe, expect, it } from 'vitest';
import { useAppCatalog } from '../../../src/renderer/composables/data/useAppCatalog';
import type { CatalogAppItem, CustomAppListItem, RendererBridge } from '../../../src/shared/core/ipc';

const makeCatalogApp = (id = 'erpnext', name = 'ERPNext'): CatalogAppItem => ({
  id,
  name,
  description: 'Test app',
  source: 'https://github.com/frappe/erpnext',
  version: '15.0.0',
  category: 'business',
  compatibility: {},
});

const makeCustomApp = (id = '831df96f-a840-482d-80f3-fe3fa5810cb2', name = 'frappe_vault', title = 'Frappe Vault'): CustomAppListItem => ({
  id,
  name,
  title,
  type: 'local',
  source: '/path/to/frappe_vault',
  createdAt: '2026-06-07T08:00:00.000Z',
  updatedAt: '2026-06-07T08:00:00.000Z',
});

const installBridge = (bridge: Partial<RendererBridge>): void => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      frappeLocal: bridge,
    },
  });
};

describe('useAppCatalog', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('resolves standard catalog app title and info', async () => {
    installBridge({
      listCatalog: async () => [makeCatalogApp()],
      listCustomApps: async () => [],
    });

    const { reload, getAppTitle, getAppInfo } = useAppCatalog();
    await reload();

    expect(getAppTitle('erpnext')).toBe('ERPNext');
    expect(getAppInfo('erpnext').name).toBe('ERPNext');
  });

  it('resolves custom app title by UUID', async () => {
    installBridge({
      listCatalog: async () => [],
      listCustomApps: async () => [makeCustomApp()],
    });

    const { reload, getAppTitle, getAppInfo } = useAppCatalog();
    await reload();

    const uuid = '831df96f-a840-482d-80f3-fe3fa5810cb2';
    expect(getAppTitle(uuid)).toBe('Frappe Vault');
    expect(getAppInfo(uuid).name).toBe('Frappe Vault');
  });

  it('formats task titles by replacing UUIDs with app titles', async () => {
    installBridge({
      listCatalog: async () => [],
      listCustomApps: async () => [makeCustomApp()],
    });

    const { reload, formatTaskTitle } = useAppCatalog();
    await reload();

    const rawMessage = 'Install app 831df96f-a840-482d-80f3-fe3fa5810cb2 on frappe.localhost completed successfully.';
    const formatted = formatTaskTitle(rawMessage);

    expect(formatted).toBe('Install app Frappe Vault on frappe.localhost completed successfully.');
  });
});
