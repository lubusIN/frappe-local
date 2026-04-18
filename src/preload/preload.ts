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
	createWorkspace: async (input) => ipcRenderer.invoke(ipcChannels.workspacesCreate, input),
	updateWorkspace: async (id, input) => ipcRenderer.invoke(ipcChannels.workspacesUpdate, id, input),
	deleteWorkspace: async (id) => ipcRenderer.invoke(ipcChannels.workspacesDelete, id),
	terminalCreate: async (benchId, siteId = null) =>
		ipcRenderer.invoke(ipcChannels.terminalCreate, benchId, siteId),
	terminalWrite: async (sessionId, data) => ipcRenderer.invoke(ipcChannels.terminalWrite, sessionId, data),
	terminalClose: async (sessionId, force = false) =>
		ipcRenderer.invoke(ipcChannels.terminalClose, sessionId, force),
	terminalClear: async (sessionId) => ipcRenderer.invoke(ipcChannels.terminalClear, sessionId),
	terminalResize: async (sessionId, dimensions) =>
		ipcRenderer.invoke(ipcChannels.terminalResize, sessionId, dimensions),
	terminalInspect: async (sessionId) => ipcRenderer.invoke(ipcChannels.terminalInspect, sessionId),
	terminalOpenFolder: async (benchId, siteId = null) =>
		ipcRenderer.invoke(ipcChannels.terminalOpenFolder, benchId, siteId),
	terminalOpenEditor: async (benchId, siteId = null) =>
		ipcRenderer.invoke(ipcChannels.terminalOpenEditor, benchId, siteId),
	terminalOpenDevcontainer: async (benchId) =>
		ipcRenderer.invoke(ipcChannels.terminalOpenDevcontainer, benchId),
	onTerminalOutput: (listener) => {
		const handler = (_event: unknown, payload: unknown) => listener(payload as never);
		ipcRenderer.on(ipcChannels.terminalOutputEvent, handler);
		return () => {
			ipcRenderer.removeListener(ipcChannels.terminalOutputEvent, handler);
		};
	},
	onTerminalError: (listener) => {
		const handler = (_event: unknown, payload: unknown) => listener(payload as never);
		ipcRenderer.on(ipcChannels.terminalErrorEvent, handler);
		return () => {
			ipcRenderer.removeListener(ipcChannels.terminalErrorEvent, handler);
		};
	},
	onTerminalStateChange: (listener) => {
		const handler = (_event: unknown, payload: unknown) => listener(payload as never);
		ipcRenderer.on(ipcChannels.terminalStateChangeEvent, handler);
		return () => {
			ipcRenderer.removeListener(ipcChannels.terminalStateChangeEvent, handler);
		};
	},
};

contextBridge.exposeInMainWorld('frappeCafe', rendererBridge);