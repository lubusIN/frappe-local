import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { ipcChannels } from '../../../src/shared/core/ipc';
import type { Bench, Site } from '../../../src/shared/domain/models';

function makeStubBenchRepo(items: Bench[] = []) {
  return {
    findAll: async () => items,
  };
}

function makeStubSiteRepo(items: Site[] = []) {
  return {
    findAll: async () => items,
  };
}

describe('apps IPC handlers', () => {
  it('identifies global app usage across benches and sites', async () => {
    const benches: Bench[] = [
      { id: 'b1', name: 'bench-1', path: '', frappeVersion: '', apps: ['frappe', 'erpnext'], status: 'running', timestamps: { createdAt: '', updatedAt: '' } },
      { id: 'b2', name: 'bench-2', path: '', frappeVersion: '', apps: ['frappe'], status: 'running', timestamps: { createdAt: '', updatedAt: '' } },
    ];
    
    const sites: Site[] = [
      { id: 's1', name: 'site1.local', benchId: 'b1', path: '', apps: ['frappe', 'erpnext'], status: 'ready', timestamps: { createdAt: '', updatedAt: '' } },
      { id: 's2', name: 'site2.local', benchId: 'b2', path: '', apps: ['frappe'], status: 'ready', timestamps: { createdAt: '', updatedAt: '' } },
    ];

    const fakeIpcMain = {
      handlers: new Map<string, (...args: unknown[]) => unknown>(),
      handle(channel: string, listener: (...args: unknown[]) => unknown) {
        this.handlers.set(channel, listener);
      },
    };

    const repos = {
      benches: makeStubBenchRepo(benches),
      sites: makeStubSiteRepo(sites),
      customApps: {},
      appCatalog: {},
      settings: {},
    } as unknown;

    registerIpcHandlers(fakeIpcMain as unknown as Electron.IpcMain, repos as never, {} as never);

    const checkUsage = fakeIpcMain.handlers.get(ipcChannels.appsCheckUsage) as (...args: unknown[]) => Promise<{ inUse: boolean; benches: string[]; sites: string[] }>;

    // Check erpnext usage
    const result = await checkUsage(null, ['erpnext']);
    expect(result.inUse).toBe(true);
    expect(result.benches).toEqual(['bench-1']);
    expect(result.sites).toEqual(['site1.local']);

    // Check custom app usage not in use
    const resultNone = await checkUsage(null, ['nonexistent']);
    expect(resultNone.inUse).toBe(false);
    expect(resultNone.benches).toEqual([]);
    expect(resultNone.sites).toEqual([]);
  });

  it('identifies bench-scoped app usage correctly', async () => {
    const benches: Bench[] = [
      { id: 'b1', name: 'bench-1', path: '', frappeVersion: '', apps: ['frappe', 'erpnext'], status: 'running', timestamps: { createdAt: '', updatedAt: '' } },
    ];
    
    const sites: Site[] = [
      { id: 's1', name: 'site1.local', benchId: 'b1', path: '', apps: ['frappe', 'erpnext'], status: 'ready', timestamps: { createdAt: '', updatedAt: '' } },
      { id: 's2', name: 'site2.local', benchId: 'b1', path: '', apps: ['frappe'], status: 'ready', timestamps: { createdAt: '', updatedAt: '' } },
    ];

    const fakeIpcMain = {
      handlers: new Map<string, (...args: unknown[]) => unknown>(),
      handle(channel: string, listener: (...args: unknown[]) => unknown) {
        this.handlers.set(channel, listener);
      },
    };

    const repos = {
      benches: makeStubBenchRepo(benches),
      sites: makeStubSiteRepo(sites),
      customApps: {},
      appCatalog: {},
      settings: {},
    } as unknown;

    registerIpcHandlers(fakeIpcMain as unknown as Electron.IpcMain, repos as never, {} as never);

    const checkUsage = fakeIpcMain.handlers.get(ipcChannels.appsCheckUsage) as (...args: unknown[]) => Promise<{ inUse: boolean; benches: string[]; sites: string[] }>;

    // Check erpnext usage scoped to bench b1
    const result = await checkUsage(null, ['erpnext'], 'b1');
    expect(result.inUse).toBe(true);
    // Benches should be empty when benchId is provided since it only checks sites ON that bench
    expect(result.benches).toEqual([]);
    expect(result.sites).toEqual(['site1.local']);
  });
});
