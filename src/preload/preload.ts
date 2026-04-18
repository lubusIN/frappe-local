import { contextBridge, ipcRenderer } from 'electron';
import type { RendererBridge } from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';

const rendererBridge: RendererBridge = {
	checkAppHealth: async () => ipcRenderer.invoke(ipcChannels.appHealthCheck),
	listCatalog: async () => ipcRenderer.invoke(ipcChannels.catalogList),
	findCatalogItem: async (id: string) => ipcRenderer.invoke(ipcChannels.catalogFindById, id),
	searchCatalog: async (query: string) => ipcRenderer.invoke(ipcChannels.catalogSearch, query),
	listBenches: async () => ipcRenderer.invoke(ipcChannels.benchesList),
};

contextBridge.exposeInMainWorld('frappeCafe', rendererBridge);