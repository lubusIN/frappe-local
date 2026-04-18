export const ipcChannels = {
  appHealthCheck: 'app:health:check',
  catalogList: 'catalog:list',
  catalogFindById: 'catalog:find-by-id',
  catalogSearch: 'catalog:search',
  benchesList: 'benches:list',
  benchesCreate: 'benches:create',
  benchesUpdate: 'benches:update',
  benchesDelete: 'benches:delete',
  benchesLogs: 'benches:logs',
  benchesOpenFolder: 'benches:open-folder',
  sitesList: 'sites:list',
  sitesCreate: 'sites:create',
  sitesUpdate: 'sites:update',
  sitesDelete: 'sites:delete',
  sitesLogs: 'sites:logs',
  sitesOpenFolder: 'sites:open-folder',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  workspacesList: 'workspaces:list',
  workspacesCreate: 'workspaces:create',
  workspacesUpdate: 'workspaces:update',
  workspacesDelete: 'workspaces:delete',
  terminalCreate: 'terminal:create',
  terminalWrite: 'terminal:write',
  terminalClose: 'terminal:close',
  terminalClear: 'terminal:clear',
  terminalResize: 'terminal:resize',
  terminalInspect: 'terminal:inspect',
  terminalOpenFolder: 'terminal:open-folder',
  terminalOpenEditor: 'terminal:open-editor',
  terminalOpenDevcontainer: 'terminal:open-devcontainer',
  terminalOutputEvent: 'terminal:output-event',
  terminalErrorEvent: 'terminal:error-event',
  terminalStateChangeEvent: 'terminal:state-change-event',
} as const;

export type AppHealthResponse = {
  readonly appName: string;
  readonly platform: string;
  readonly nodeVersion: string;
  readonly electronVersion: string;
  readonly timestamp: string;
};

export type CatalogAppItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly version: string;
  readonly compatibility: {
    readonly minimumFrappeVersion?: string;
    readonly maximumFrappeVersion?: string;
    readonly supportedRuntimes: readonly ('docker' | 'podman')[];
  };
};

export type BenchListItem = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly frappeVersion: string;
  readonly runtime: 'docker' | 'podman';
  readonly status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
  readonly appCount: number;
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
  readonly runtime: 'docker' | 'podman';
  readonly apps: string[];
};

export type BenchUpdateInput = {
  readonly name?: string;
  readonly path?: string;
  readonly frappeVersion?: string;
  readonly runtime?: 'docker' | 'podman';
  readonly status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
  readonly apps?: string[];
};

export type SiteListItem = {
  readonly id: string;
  readonly name: string;
  readonly benchId: string;
  readonly groupId: string | null;
  readonly status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
  readonly path: string;
  readonly appCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SiteCreateInput = {
  readonly name: string;
  readonly benchId: string;
  readonly groupId: string | null;
  readonly path: string;
  readonly apps: string[];
};

export type SiteUpdateInput = {
  readonly name?: string;
  readonly benchId?: string;
  readonly groupId?: string | null;
  readonly path?: string;
  readonly status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
  readonly apps?: string[];
};

export type SettingsItem = {
  readonly defaultFrappeVersion: string;
  readonly runtimePreference: 'docker' | 'podman';
  readonly storagePath: string;
  readonly terminalPreference: string;
  readonly editorPreference: string;
  readonly updateChannel: 'stable' | 'beta';
  readonly autoUpdateEnabled: boolean;
};

export type WorkspaceListItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: string[];
  readonly siteCount: number;
};

export type WorkspaceCreateInput = {
  readonly name: string;
  readonly description: string;
  readonly tags: string[];
};

export type WorkspaceUpdateInput = {
  readonly name?: string;
  readonly description?: string;
  readonly tags?: string[];
};

export type TerminalCreateResponse = {
  readonly sessionId: string;
  readonly state: 'idle' | 'connecting' | 'ready' | 'closed' | 'error';
  readonly workingDirectory: string;
};

export type TerminalDimensions = {
  readonly rows: number;
  readonly cols: number;
};

export type TerminalSessionInspection = {
  readonly sessionId: string;
  readonly state: 'idle' | 'connecting' | 'ready' | 'closed' | 'error';
  readonly workingDirectory: string;
  readonly contextBenchId: string;
  readonly contextSiteId: string | null;
  readonly createdAt: string;
  readonly lastActivityAt: string;
};

export type TerminalOutputEvent = {
  readonly sessionId: string;
  readonly output: string;
  readonly timestamp: string;
};

export type TerminalErrorEvent = {
  readonly sessionId: string;
  readonly code: string;
  readonly message: string;
  readonly timestamp: string;
};

export type TerminalStateChangeEvent = {
  readonly sessionId: string;
  readonly previousState: 'idle' | 'connecting' | 'ready' | 'closed' | 'error';
  readonly newState: 'idle' | 'connecting' | 'ready' | 'closed' | 'error';
  readonly timestamp: string;
};

export type RendererBridge = {
  readonly checkAppHealth: () => Promise<AppHealthResponse>;
  readonly listCatalog: () => Promise<CatalogAppItem[]>;
  readonly findCatalogItem: (id: string) => Promise<CatalogAppItem | null>;
  readonly searchCatalog: (query: string) => Promise<CatalogAppItem[]>;
  readonly listBenches: () => Promise<BenchListItem[]>;
  readonly createBench: (input: BenchCreateInput) => Promise<BenchListItem>;
  readonly updateBench: (id: string, input: BenchUpdateInput) => Promise<BenchListItem | null>;
  readonly deleteBench: (id: string) => Promise<boolean>;
  readonly listBenchLogs: (id: string) => Promise<LifecycleLogItem[]>;
  readonly openBenchFolder: (id: string) => Promise<boolean>;
  readonly listSites: () => Promise<SiteListItem[]>;
  readonly createSite: (input: SiteCreateInput) => Promise<SiteListItem>;
  readonly updateSite: (id: string, input: SiteUpdateInput) => Promise<SiteListItem | null>;
  readonly deleteSite: (id: string) => Promise<boolean>;
  readonly listSiteLogs: (id: string) => Promise<LifecycleLogItem[]>;
  readonly openSiteFolder: (id: string) => Promise<boolean>;
  readonly getSettings: () => Promise<SettingsItem | null>;
  readonly setSettings: (settings: SettingsItem) => Promise<SettingsItem>;
  readonly listWorkspaces: () => Promise<WorkspaceListItem[]>;
  readonly createWorkspace: (input: WorkspaceCreateInput) => Promise<WorkspaceListItem>;
  readonly updateWorkspace: (id: string, input: WorkspaceUpdateInput) => Promise<WorkspaceListItem | null>;
  readonly deleteWorkspace: (id: string) => Promise<boolean>;
  readonly terminalCreate: (benchId: string, siteId?: string | null) => Promise<TerminalCreateResponse>;
  readonly terminalWrite: (sessionId: string, data: string) => Promise<boolean>;
  readonly terminalClose: (sessionId: string, force?: boolean) => Promise<boolean>;
  readonly terminalClear: (sessionId: string) => Promise<boolean>;
  readonly terminalResize: (sessionId: string, dimensions: TerminalDimensions) => Promise<boolean>;
  readonly terminalInspect: (sessionId: string) => Promise<TerminalSessionInspection | null>;
  readonly terminalOpenFolder: (benchId: string, siteId?: string | null) => Promise<boolean>;
  readonly terminalOpenEditor: (benchId: string, siteId?: string | null) => Promise<boolean>;
  readonly terminalOpenDevcontainer: (benchId: string) => Promise<boolean>;
  readonly onTerminalOutput: (listener: (event: TerminalOutputEvent) => void) => () => void;
  readonly onTerminalError: (listener: (event: TerminalErrorEvent) => void) => () => void;
  readonly onTerminalStateChange: (listener: (event: TerminalStateChangeEvent) => void) => () => void;
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