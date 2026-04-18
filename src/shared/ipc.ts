export const ipcChannels = {
  appHealthCheck: 'app:health:check',
  catalogList: 'catalog:list',
  catalogFindById: 'catalog:find-by-id',
  catalogSearch: 'catalog:search',
  benchesList: 'benches:list',
  benchesCreate: 'benches:create',
  sitesList: 'sites:list',
  sitesCreate: 'sites:create',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  workspacesList: 'workspaces:list',
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

export type BenchCreateInput = {
  readonly name: string;
  readonly path: string;
  readonly frappeVersion: string;
  readonly runtime: 'docker' | 'podman';
  readonly apps: string[];
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

export type RendererBridge = {
  readonly checkAppHealth: () => Promise<AppHealthResponse>;
  readonly listCatalog: () => Promise<CatalogAppItem[]>;
  readonly findCatalogItem: (id: string) => Promise<CatalogAppItem | null>;
  readonly searchCatalog: (query: string) => Promise<CatalogAppItem[]>;
  readonly listBenches: () => Promise<BenchListItem[]>;
  readonly createBench: (input: BenchCreateInput) => Promise<BenchListItem>;
  readonly listSites: () => Promise<SiteListItem[]>;
  readonly createSite: (input: SiteCreateInput) => Promise<SiteListItem>;
  readonly getSettings: () => Promise<SettingsItem | null>;
  readonly setSettings: (settings: SettingsItem) => Promise<SettingsItem>;
  readonly listWorkspaces: () => Promise<WorkspaceListItem[]>;
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