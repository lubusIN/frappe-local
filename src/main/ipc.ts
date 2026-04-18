import type { AppHealthResponse } from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';

type IpcMainLike = {
  handle: (channel: string, listener: () => Promise<AppHealthResponse> | AppHealthResponse) => void;
};

export const buildAppHealthResponse = (): AppHealthResponse => ({
  appName: 'Frappe Cafe',
  platform: process.platform,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  timestamp: new Date().toISOString(),
});

export const registerIpcHandlers = (ipcMainLike: IpcMainLike): void => {
  ipcMainLike.handle(ipcChannels.appHealthCheck, async () => buildAppHealthResponse());
};