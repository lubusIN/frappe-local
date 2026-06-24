import { contextBridge, ipcRenderer } from 'electron';
import type { CreateCustomAppInput, UpdateCustomAppInput } from '../shared/domain/models';
import type { RendererBridge } from '../shared/core/ipc';
import { ipcChannels } from '../shared/core/ipc';

const rendererBridge: RendererBridge = {
	checkAppHealth: async () => ipcRenderer.invoke(ipcChannels.appHealthCheck),

	checkForUpdates: async () => ipcRenderer.invoke(ipcChannels.updateCheckNow),
	runDiagnostics: async () => ipcRenderer.invoke(ipcChannels.diagnosticsRun),
	getLastDiagnosticsReport: async () => ipcRenderer.invoke(ipcChannels.diagnosticsGetLast),
	resetDevState: async () => ipcRenderer.invoke(ipcChannels.diagnosticsResetDevState),
	fixRuntime: async (checkType) => ipcRenderer.invoke(ipcChannels.runtimeFix, checkType),
	listCatalog: async () => ipcRenderer.invoke(ipcChannels.catalogList),
	findCatalogItem: async (id: string) => ipcRenderer.invoke(ipcChannels.catalogFindById, id),
	searchCatalog: async (query: string) => ipcRenderer.invoke(ipcChannels.catalogSearch, query),
	listCustomApps: async () => ipcRenderer.invoke(ipcChannels.customAppsList),
	createCustomApp: async (input: CreateCustomAppInput) => ipcRenderer.invoke(ipcChannels.customAppsCreate, input),
	updateCustomApp: async (id: string, input: UpdateCustomAppInput) => ipcRenderer.invoke(ipcChannels.customAppsUpdate, id, input),
	deleteCustomApp: async (id: string) => ipcRenderer.invoke(ipcChannels.customAppsDelete, id),
	extractCustomApp: async (type: 'github' | 'local', source: string) => ipcRenderer.invoke(ipcChannels.customAppsExtract, type, source),
	listBenches: async () => ipcRenderer.invoke(ipcChannels.benchesList),
	pickBenchFolder: async () => ipcRenderer.invoke(ipcChannels.benchesPickFolder),
	createBench: async (input) => ipcRenderer.invoke(ipcChannels.benchesCreate, input),
	updateBench: async (id, input) => ipcRenderer.invoke(ipcChannels.benchesUpdate, id, input),
	deleteBench: async (id) => ipcRenderer.invoke(ipcChannels.benchesDelete, id),
	listBenchLogs: async (id) => ipcRenderer.invoke(ipcChannels.benchesLogs, id),
	openBenchFolder: async (id) => ipcRenderer.invoke(ipcChannels.benchesOpenFolder, id),
	openBenchShell: async (id) => ipcRenderer.invoke(ipcChannels.benchesOpenShell, id),
	cleanBenchSites: async (id) => ipcRenderer.invoke(ipcChannels.benchesCleanSites, id),
	listSites: async () => ipcRenderer.invoke(ipcChannels.sitesList),
	createSite: async (input) => ipcRenderer.invoke(ipcChannels.sitesCreate, input),
	updateSite: async (id, input) => ipcRenderer.invoke(ipcChannels.sitesUpdate, id, input),
	deleteSite: async (id) => ipcRenderer.invoke(ipcChannels.sitesDelete, id),
	listSiteLogs: async (id) => ipcRenderer.invoke(ipcChannels.sitesLogs, id),
	openSiteFolder: async (id) => ipcRenderer.invoke(ipcChannels.sitesOpenFolder, id),
	getSettings: async () => ipcRenderer.invoke(ipcChannels.settingsGet),
	setSettings: async (settings) => ipcRenderer.invoke(ipcChannels.settingsSet, settings),
	getSystemResources: async () => ipcRenderer.invoke(ipcChannels.systemResourcesGet),
	syncCatalog: async (apps) => ipcRenderer.invoke(ipcChannels.catalogSync, apps),
	openSiteExternal: async (id) => ipcRenderer.invoke(ipcChannels.sitesOpenExternal, id),

	subscribeTaskRunnerEvents: async () => ipcRenderer.invoke(ipcChannels.taskRunnerSubscribe),
	unsubscribeTaskRunnerEvents: async () => ipcRenderer.invoke(ipcChannels.taskRunnerUnsubscribe),
	readTaskLog: async (taskId: string) => ipcRenderer.invoke(ipcChannels.taskRunnerReadLog, taskId),
	onTaskRunnerProgress: (listener) => {
		const handler = (_event: unknown, payload: unknown) => listener(payload as never);
		ipcRenderer.on(ipcChannels.taskRunnerProgressEvent, handler);
		return () => {
			ipcRenderer.removeListener(ipcChannels.taskRunnerProgressEvent, handler);
		};
	},
	pathExists: async (path: string) => ipcRenderer.invoke(ipcChannels.utilsPathExists, path),
	openExternal: async (url: string) => ipcRenderer.invoke(ipcChannels.utilsOpenExternal, url),
	checkGithubRepoVisibility: async (url: string) => ipcRenderer.invoke(ipcChannels.utilsCheckGithubRepoVisibility, url),
	uiReady: async () => ipcRenderer.invoke(ipcChannels.uiReady),
	getFrontDoorStatus: async () => ipcRenderer.invoke(ipcChannels.frontDoorStatus),
};

contextBridge.exposeInMainWorld('frappeLocal', rendererBridge);
