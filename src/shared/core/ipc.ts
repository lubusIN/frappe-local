import type { TaskProgressEvent } from '../domain/task-runner';
import type { DiagnosticsReport } from '../domain/diagnostics';
import type {
  AppCatalogItem,
  CreateCustomAppInput,
  UpdateCustomAppInput,
} from '../domain/models';

export const ipcChannels = {
  appHealthCheck: 'app:health:check',
  updateCheckNow: 'update:check-now',
  catalogList: 'catalog:list',
  catalogSync: 'catalog:sync',
  diagnosticsRun: 'diagnostics:run',
  diagnosticsGetLast: 'diagnostics:get-last',
  diagnosticsResetDevState: 'diagnostics:reset-dev-state',
  runtimeFix: 'runtime:fix',
  catalogFindById: 'catalog:find-by-id',
  catalogSearch: 'catalog:search',
  customAppsList: 'custom-apps:list',
  customAppsCreate: 'custom-apps:create',
  customAppsUpdate: 'custom-apps:update',
  customAppsDelete: 'custom-apps:delete',
  customAppsExtract: 'custom-apps:extract',
  benchesList: 'benches:list',
  benchesPickFolder: 'benches:pick-folder',
  benchesCreate: 'benches:create',
  benchesUpdate: 'benches:update',
  benchesDelete: 'benches:delete',
  benchesLogs: 'benches:logs',
  benchesOpenFolder: 'benches:open-folder',
  benchesOpenShell: 'benches:open-shell',
  benchesCleanSites: 'benches:clean-sites',
  sitesList: 'sites:list',
  sitesCreate: 'sites:create',
  sitesUpdate: 'sites:update',
  sitesDelete: 'sites:delete',
  sitesLogs: 'sites:logs',
  sitesOpenFolder: 'sites:open-folder',
  sitesOpenExternal: 'sites:open-external',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  systemResourcesGet: 'system:resources:get',

  taskRunnerSubscribe: 'task-runner:subscribe',
  taskRunnerUnsubscribe: 'task-runner:unsubscribe',
  taskRunnerProgressEvent: 'task-runner:progress-event',
  taskRunnerReadLog: 'task-runner:read-log',
  utilsPathExists: 'utils:path-exists',
  utilsOpenExternal: 'utils:open-external',
  utilsCheckGithubRepoVisibility: 'utils:check-github-repo-visibility',
  uiReady: 'app:ui-ready',
  frontDoorStatus: 'app:front-door-status',
} as const;

export type AppHealthResponse = {
  readonly appName: string;
  readonly platform: string;
  readonly nodeVersion: string;
  readonly electronVersion: string;
  readonly timestamp: string;
};



export type UpdateCheckResult = {
  readonly checkedAt: string;
  readonly source: 'manual';
  readonly status: 'not-configured' | 'update-available' | 'up-to-date' | 'error';
  readonly message: string;
};

export type DiagnosticsRunResponse = DiagnosticsReport;
export type DiagnosticsGetLastResponse = DiagnosticsReport | null;

export type CatalogAppItem = AppCatalogItem;

export type CustomAppListItem = {
  readonly id: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly type: 'github' | 'local';
  readonly source: string;
  readonly branch?: string;
  readonly icon?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ExtractedCustomAppMetadata = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  readonly branch?: string;
};

export type BenchListItem = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly frappeVersion: string;
  readonly httpPort?: number;
  readonly status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
  readonly appCount: number;
  readonly apps: string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type LifecycleLogItem = {
  readonly id: string;
  readonly entityId: string;
  readonly level: 'info' | 'error';
  readonly message: string;
  readonly timestamp: string;
};

export type BenchCreateInput = {
  readonly name: string;
  readonly path: string;
  readonly frappeVersion: string;
  readonly httpPort?: number;

  readonly apps: string[];
};

export type BenchUpdateInput = {
  readonly name?: string;
  readonly path?: string;
  readonly frappeVersion?: string;
  readonly httpPort?: number;

  readonly status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
  readonly apps?: string[];
};

export type SiteListItem = {
  readonly id: string;
  readonly name: string;
  readonly benchId: string;
  readonly status: 'queued' | 'ready' | 'failure';
  readonly path: string;
  readonly appCount: number;
  readonly apps?: string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SiteCreateInput = {
  readonly name: string;
  readonly benchId: string;
  readonly path: string;
  readonly apps: string[];
  readonly force?: boolean;
};

export type SiteUpdateInput = {
  readonly name?: string;
  readonly benchId?: string;
  readonly path?: string;
  readonly status?: 'queued' | 'ready' | 'failure';
  readonly apps?: string[];
};

export type SettingsItem = {
  readonly defaultFrappeVersion: string;
  readonly storagePath: string;
  readonly editorPreference: string;
  readonly updateChannel: 'stable' | 'beta' | 'alpha' | 'nightly';
  readonly autoUpdateEnabled: boolean;
  readonly sidebarCompact: boolean;
  readonly podmanMemoryMb: number;
  readonly shareSshKeys: boolean;
  readonly theme: 'system' | 'light' | 'dark';
};

export type SystemResources = {
  readonly totalMemoryMb: number;
  readonly recommendedPodmanMemoryMb: number;
  readonly podmanMachineRequired: boolean;
};

export type RendererBridge = {
  readonly checkAppHealth: () => Promise<AppHealthResponse>;

  readonly checkForUpdates: () => Promise<UpdateCheckResult>;
  readonly runDiagnostics: () => Promise<DiagnosticsReport>;
  readonly getLastDiagnosticsReport: () => Promise<DiagnosticsReport | null>;
  readonly resetDevState: () => Promise<boolean>;
  readonly fixRuntime: (checkType: string) => Promise<boolean>;
  readonly listCatalog: () => Promise<CatalogAppItem[]>;
  readonly syncCatalog: (apps: CatalogAppItem[]) => Promise<boolean>;
  readonly findCatalogItem: (id: string) => Promise<CatalogAppItem | null>;
  readonly searchCatalog: (query: string) => Promise<CatalogAppItem[]>;
  readonly listCustomApps: () => Promise<CustomAppListItem[]>;
  readonly createCustomApp: (input: CreateCustomAppInput) => Promise<CustomAppListItem>;
  readonly updateCustomApp: (id: string, input: UpdateCustomAppInput) => Promise<CustomAppListItem | null>;
  readonly deleteCustomApp: (id: string) => Promise<boolean>;
  readonly extractCustomApp: (type: 'github' | 'local', source: string) => Promise<ExtractedCustomAppMetadata>;
  readonly listBenches: () => Promise<BenchListItem[]>;
  readonly pickBenchFolder: () => Promise<string | null>;
  readonly createBench: (input: BenchCreateInput) => Promise<BenchListItem>;
  readonly updateBench: (id: string, input: BenchUpdateInput) => Promise<BenchListItem | null>;
  readonly deleteBench: (id: string) => Promise<boolean>;
  readonly listBenchLogs: (id: string) => Promise<LifecycleLogItem[]>;
  readonly openBenchFolder: (id: string) => Promise<boolean>;
  readonly openBenchShell: (id: string) => Promise<boolean>;
  readonly cleanBenchSites: (id: string) => Promise<boolean>;
  readonly listSites: () => Promise<SiteListItem[]>;
  readonly createSite: (input: SiteCreateInput) => Promise<SiteListItem>;
  readonly updateSite: (id: string, input: SiteUpdateInput) => Promise<SiteListItem | null>;
  readonly deleteSite: (id: string) => Promise<boolean>;
  readonly listSiteLogs: (id: string) => Promise<LifecycleLogItem[]>;
  readonly openSiteFolder: (id: string) => Promise<boolean>;
  readonly openSiteExternal: (id: string) => Promise<boolean>;
  readonly getSettings: () => Promise<SettingsItem | null>;
  readonly setSettings: (settings: SettingsItem) => Promise<SettingsItem>;
  readonly getSystemResources: () => Promise<SystemResources>;

  readonly subscribeTaskRunnerEvents: () => Promise<boolean>;
  readonly unsubscribeTaskRunnerEvents: () => Promise<boolean>;
  readonly readTaskLog: (taskId: string) => Promise<string>;
  readonly onTaskRunnerProgress: (listener: (event: TaskProgressEvent) => void) => () => void;
  readonly pathExists: (path: string) => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<void>;
  readonly checkGithubRepoVisibility: (url: string) => Promise<boolean>;
  readonly uiReady: () => Promise<void>;
  readonly getFrontDoorStatus: () => Promise<{ available: boolean; secure: boolean }>;
};

export const isAppHealthResponse = (value: unknown): value is AppHealthResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.appName === 'string' &&
    typeof candidate.platform === 'string' &&
    typeof candidate.nodeVersion === 'string' &&
    typeof candidate.electronVersion === 'string' &&
    typeof candidate.timestamp === 'string'
  );
};
