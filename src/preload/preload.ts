import { contextBridge, ipcRenderer } from 'electron';
import type { RendererBridge } from '../shared/ipc';
import { ipcChannels } from '../shared/ipc';

const rendererBridge: RendererBridge = {
	checkAppHealth: async () => ipcRenderer.invoke(ipcChannels.appHealthCheck),
	listCatalog: async () => ipcRenderer.invoke(ipcChannels.catalogList),
	findCatalogItem: async (id: string) => ipcRenderer.invoke(ipcChannels.catalogFindById, id),
	searchCatalog: async (query: string) => ipcRenderer.invoke(ipcChannels.catalogSearch, query),
	listBenches: async () => ipcRenderer.invoke(ipcChannels.benchesList),
	createBench: async (input) => ipcRenderer.invoke(ipcChannels.benchesCreate, input),
	updateBench: async (id, input) => ipcRenderer.invoke(ipcChannels.benchesUpdate, id, input),
	deleteBench: async (id) => ipcRenderer.invoke(ipcChannels.benchesDelete, id),
	listBenchLogs: async (id) => ipcRenderer.invoke(ipcChannels.benchesLogs, id),
	openBenchFolder: async (id) => ipcRenderer.invoke(ipcChannels.benchesOpenFolder, id),
	listSites: async () => ipcRenderer.invoke(ipcChannels.sitesList),
	createSite: async (input) => ipcRenderer.invoke(ipcChannels.sitesCreate, input),
	updateSite: async (id, input) => ipcRenderer.invoke(ipcChannels.sitesUpdate, id, input),
	deleteSite: async (id) => ipcRenderer.invoke(ipcChannels.sitesDelete, id),
	listSiteLogs: async (id) => ipcRenderer.invoke(ipcChannels.sitesLogs, id),
	openSiteFolder: async (id) => ipcRenderer.invoke(ipcChannels.sitesOpenFolder, id),
	getSettings: async () => ipcRenderer.invoke(ipcChannels.settingsGet),
	setSettings: async (settings) => ipcRenderer.invoke(ipcChannels.settingsSet, settings),
	listWorkspaces: async () => ipcRenderer.invoke(ipcChannels.workspacesList),
};

contextBridge.exposeInMainWorld('frappeCafe', rendererBridge);