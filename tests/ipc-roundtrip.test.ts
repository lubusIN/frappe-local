import { describe, expect, it } from 'vitest';
import { registerIpcHandlers } from '../src/main/ipc';
import { ipcChannels } from '../src/shared/ipc';

describe('ipc roundtrip', () => {
  it('returns app health through the registered handler', async () => {
    const handlers = new Map<string, () => Promise<unknown> | unknown>();

    registerIpcHandlers({
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
    });

    const appHealthHandler = handlers.get(ipcChannels.appHealthCheck);

    expect(appHealthHandler).toBeTypeOf('function');

    const response = await appHealthHandler?.();

    expect(response).toMatchObject({
      appName: 'Frappe Cafe',
      platform: process.platform,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    });
  });
});