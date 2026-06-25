import type { RendererBridge } from '@frappe-local/shared/core';

const IPC_UNAVAILABLE_MESSAGE =
  'IPC bridge is unavailable. Ensure the preload script is loaded before using renderer features.';

const rejectUnavailable = <T>(): Promise<T> => Promise.reject(new Error(IPC_UNAVAILABLE_MESSAGE));

const noopDispose = (): void => {};

const unavailableBridge: RendererBridge = {
  checkAppHealth: () => rejectUnavailable(),
  checkForUpdates: () => rejectUnavailable(),
  downloadUpdate: () => rejectUnavailable(),
  installUpdate: () => rejectUnavailable(),
  onUpdateAvailable: () => noopDispose,
  onUpdateDownloading: () => noopDispose,
  onUpdateDownloaded: () => noopDispose,
  runDiagnostics: () => rejectUnavailable(),
  getLastDiagnosticsReport: () => rejectUnavailable(),
  resetDevState: () => rejectUnavailable(),
  fixRuntime: () => rejectUnavailable(),
  listCatalog: () => rejectUnavailable(),
  syncCatalog: () => rejectUnavailable(),
  findCatalogItem: () => rejectUnavailable(),
  searchCatalog: () => rejectUnavailable(),
  listBenches: () => rejectUnavailable(),
  pickBenchFolder: () => rejectUnavailable(),
  createBench: () => rejectUnavailable(),
  updateBench: () => rejectUnavailable(),
  deleteBench: () => rejectUnavailable(),
  listBenchLogs: () => rejectUnavailable(),
  openBenchFolder: () => rejectUnavailable(),
  openBenchShell: () => rejectUnavailable(),
  cleanBenchSites: () => rejectUnavailable(),
  listSites: () => rejectUnavailable(),
  createSite: () => rejectUnavailable(),
  updateSite: () => rejectUnavailable(),
  deleteSite: () => rejectUnavailable(),
  listSiteLogs: () => rejectUnavailable(),
  openSiteFolder: () => rejectUnavailable(),
  openSiteExternal: () => rejectUnavailable(),
  getSettings: () => rejectUnavailable(),
  setSettings: () => rejectUnavailable(),
  getSystemResources: () => rejectUnavailable(),
  subscribeTaskRunnerEvents: () => rejectUnavailable(),
  unsubscribeTaskRunnerEvents: () => rejectUnavailable(),
  readTaskLog: () => rejectUnavailable(),
  cancelTask: () => rejectUnavailable(),
  onTaskRunnerProgress: () => noopDispose,
  pathExists: () => rejectUnavailable(),
  openExternal: () => rejectUnavailable(),
  uiReady: () => rejectUnavailable(),
  listCustomApps: () => rejectUnavailable(),
  createCustomApp: () => rejectUnavailable(),
  updateCustomApp: () => rejectUnavailable(),
  deleteCustomApp: () => rejectUnavailable(),
  extractCustomApp: () => rejectUnavailable(),
  checkGithubRepoVisibility: () => rejectUnavailable(),
  getFrontDoorStatus: () => rejectUnavailable(),
};

export const isIpcBridgeAvailable = (): boolean => {
  return Boolean((window as Window & { frappeLocal?: RendererBridge }).frappeLocal);
};

/**
 * Returns the IPC bridge exposed by the preload script.
 * Falls back to a rejecting bridge so the UI can render an actionable error state.
 */
export const useIpc = (): RendererBridge => {
  const bridge = (window as Window & { frappeLocal?: RendererBridge }).frappeLocal;
  return bridge ?? unavailableBridge;
};
