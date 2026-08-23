import { registerBenchesIpc } from './ipc/benches';
import { registerSitesIpc } from './ipc/sites';
import { registerAppsIpc } from './ipc/apps';
import { registerSettingsIpc } from './ipc/settings';
import { registerSystemIpc } from './ipc/system';

import type { BenchCreateInput, BenchUpdateInput, CatalogAppItem, SiteCreateInput, SiteUpdateInput } from '@frappe-local/shared/core';
import type { TaskProgressEvent } from '@frappe-local/shared/domain';
import { type TaskExecutionContext } from '@frappe-local/main/services';

import type { AppRuntimePaths } from '@frappe-local/main/config';
import fs from 'node:fs';
import { type Bench, type CreateCustomAppInput, type CustomAppItem, type Settings, type Site, type UpdateCustomAppInput } from '@frappe-local/shared/domain';

import type { LifecycleOperation } from '@frappe-local/main/services';

export type IpcMainLike = {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
};

export type TaskRunnerLike = {
  onEvent?: (listener: (event: TaskProgressEvent) => void) => () => void;
  configureLogDirectory?: (logDirectory: string | null) => void;
  enqueue: (definition: { name: string; resource: { type: 'bench' | 'site' | 'runtime' | 'system'; id: string }; run: (context: TaskExecutionContext) => Promise<void> }) => string;
  cancelTask?: (taskId: string) => boolean;
};

export type IpcRepositories = {
  readonly appCatalog: {
    findAll: () => Promise<CatalogAppItem[]>;
    sync?: (apps: CatalogAppItem[]) => Promise<void>;
    findById?: (id: string) => Promise<CatalogAppItem | null>;
    search?: (query: string) => Promise<CatalogAppItem[]>;
  };
  readonly benches: {
    findAll: () => Promise<Bench[]>;
    findById: (id: string) => Promise<Bench | null>;
    create: (input: BenchCreateInput & { status: 'queued' | 'running' | 'stopped'; apps: string[] }) => Promise<Bench>;
    update: (id: string, input: Partial<BenchUpdateInput>) => Promise<Bench | null>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly sites: {
    findAll: () => Promise<Site[]>;
    findById: (id: string) => Promise<Site | null>;
    create: (input: SiteCreateInput & { status: 'queued' | 'ready' | 'failure'; path: string }) => Promise<Site>;
    update: (id: string, input: Partial<SiteUpdateInput>) => Promise<Site | null>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly settings: {
    findAll?: () => Promise<Settings[]>;
    update?: (input: Partial<Settings>) => Promise<Settings>;
    get?: () => Promise<Settings | null>;
    set?: (input: Partial<Settings>) => Promise<Settings>;
  };
  readonly customApps: {
    findAll: () => Promise<CustomAppItem[]>;
    findById: (id: string) => Promise<CustomAppItem | null>;
    create: (input: CreateCustomAppInput) => Promise<CustomAppItem>;
    update: (id: string, input: UpdateCustomAppInput) => Promise<CustomAppItem | null>;
    delete: (id: string) => Promise<boolean>;
  };
};

export type IpcOperations = {
  openPath: (targetPath: string) => Promise<boolean>;
  openInEditor: (targetPath: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  pathExists: (targetPath: string) => boolean;
  isFrontDoorAvailable?: () => boolean;
  isFrontDoorSecure?: () => boolean;
  refreshFrontDoorHosts?: () => Promise<void>;
  applyRuntimeMemory?: (memoryMb: number) => Promise<void>;
  installWslTask?: (context: import('@frappe-local/main/services/task-runner').TaskExecutionContext) => Promise<void>;
  trackBenchOperation?: (benchId: string, operation: LifecycleOperation) => void;
  trackSiteOperation?: (siteId: string, operation: LifecycleOperation) => void;
};

export type AppRepositories = IpcRepositories;

export const registerIpcHandlers = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations = {
    openPath: async () => false,
    openInEditor: async () => false,
    openExternal: async () => false,
    pathExists: (targetPath) => fs.existsSync(targetPath),
    isFrontDoorAvailable: () => false,
    isFrontDoorSecure: () => false,
    refreshFrontDoorHosts: async () => undefined,
  },
  taskRunner: TaskRunnerLike = { enqueue: () => '' },
  appVersion: string = '0.1.0',
  runtimePaths: AppRuntimePaths = {
    userDataPath: '',
    logsPath: '',
    configPath: '',
    storagePath: ''
  }
) => {
  registerBenchesIpc(ipcMainLike, repositories, operations, taskRunner);
  registerSitesIpc(ipcMainLike, repositories, operations);
  registerAppsIpc(ipcMainLike, repositories, operations);
  registerSettingsIpc(ipcMainLike, repositories, operations);
  registerSystemIpc(ipcMainLike, repositories, operations, taskRunner, appVersion, runtimePaths);
};
