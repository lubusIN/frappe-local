import type { RendererBridge } from '../../shared/ipc';

const IPC_UNAVAILABLE_MESSAGE =
  'IPC bridge is unavailable. Ensure the preload script is loaded before using renderer features.';

const rejectUnavailable = <T>(): Promise<T> => Promise.reject(new Error(IPC_UNAVAILABLE_MESSAGE));

const noopDispose = (): void => {};

const unavailableBridge: RendererBridge = {
  checkAppHealth: () => rejectUnavailable(),
  getUpdateStatus: () => rejectUnavailable(),
  checkForUpdates: () => rejectUnavailable(),
  runDiagnostics: () => rejectUnavailable(),
  getLastDiagnosticsReport: () => rejectUnavailable(),
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
  exportSitePackage: () => rejectUnavailable(),
  validateImportPackage: () => rejectUnavailable(),
  executeImportPackage: () => rejectUnavailable(),
  subscribeTaskRunnerEvents: () => rejectUnavailable(),
  unsubscribeTaskRunnerEvents: () => rejectUnavailable(),
  onTaskRunnerProgress: () => noopDispose,
  pathExists: () => rejectUnavailable(),
  openExternal: () => rejectUnavailable(),
};

export const isIpcBridgeAvailable = (): boolean => {
  return Boolean((window as Window & { frappeCafe?: RendererBridge }).frappeCafe);
};

/**
 * Returns the IPC bridge exposed by the preload script.
 * Falls back to a rejecting bridge so the UI can render an actionable error state.
 */
export const useIpc = (): RendererBridge => {
  const bridge = (window as Window & { frappeCafe?: RendererBridge }).frappeCafe;
  return bridge ?? unavailableBridge;
};
