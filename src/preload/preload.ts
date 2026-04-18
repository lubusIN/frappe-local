import { contextBridge, ipcRenderer } from 'electron';
import type { RendererBridge } from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';

const rendererBridge: RendererBridge = {
	checkAppHealth: async () => ipcRenderer.invoke(ipcChannels.appHealthCheck),
};

contextBridge.exposeInMainWorld('frappeCafe', rendererBridge);