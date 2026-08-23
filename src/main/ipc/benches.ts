
import type { IpcMainLike, AppRepositories, IpcOperations, TaskRunnerLike } from '../ipc';

import type { BenchCreateInput, BenchListItem, BenchUpdateInput, LifecycleLogItem } from '@frappe-local/shared/core';
import { getRuntimeEnv, orchestrateBenchAppChanges, orchestrateBenchBuild, orchestrateBenchCleaning, orchestrateBenchCreation, orchestrateBenchDeletion, orchestrateBenchStart, orchestrateBenchStop } from '@frappe-local/main/services';

import { filterNonCoreApps, ipcChannels } from '@frappe-local/shared/core';
import { DEFAULT_HTTP_PORT, findNextAvailableTcpPort } from '@frappe-local/main/utils';

import { createMainLogger } from '@frappe-local/main/logger';

import { normalizeSiteHost } from '@frappe-local/shared/utils/site-hostname';

const mainLogger = createMainLogger('ipc');

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dialog } from 'electron';
import { CreateBenchInputSchema, UpdateBenchInputSchema, type Bench, type Settings } from '@frappe-local/shared/domain';

const resolveUserPath = (untrimmedPath: string): string => {
  if (typeof untrimmedPath !== 'string') {
    return '';
  }
  const trimmedPath = untrimmedPath.trim();
  if (trimmedPath.startsWith('~')) {
    return path.join(os.homedir(), trimmedPath.slice(1));
  }

  return path.resolve(trimmedPath);
};

const deriveUsedBenchPorts = (benches: Bench[]): Set<number> => {
  return new Set(
    benches
      .map((bench) => bench.httpPort ?? DEFAULT_HTTP_PORT)
      .filter((port) => Number.isInteger(port) && port >= 1024 && port <= 65535)
  );
};


const toBenchListItem = (bench: Bench): BenchListItem => ({
  id: bench.id,
  name: bench.name,
  path: bench.path,
  frappeVersion: bench.frappeVersion,
  httpPort: bench.httpPort,
  status: bench.status,
  appCount: filterNonCoreApps(bench.apps).length,
  apps: bench.apps,
  createdAt: bench.timestamps.createdAt,
  updatedAt: bench.timestamps.updatedAt,
});


const byCreatedAtDesc = <T extends { timestamps: { createdAt: string } }>(left: T, right: T): number =>
  right.timestamps.createdAt.localeCompare(left.timestamps.createdAt);

const toLifecycleLogs = (
  entityId: string,
  entityName: string,
  status: 'queued' | 'running' | 'stopped' | 'success' | 'failure' | 'ready',
  path: string,
  createdAt: string,
  updatedAt: string
): LifecycleLogItem[] => {
  const logs: LifecycleLogItem[] = [
    {
      id: `${entityId}-created`,
      entityId,
      level: 'info',
      message: `Entity "${entityName}" created at ${path}`,
      timestamp: createdAt,
    },
    {
      id: `${entityId}-status-${status}`,
      entityId,
      level: 'info',
      message: `Status of "${entityName}" updated to ${status}`,
      timestamp: updatedAt,
    },
  ];

  return logs;
};

const getCurrentSettings = async (repository: AppRepositories['settings']): Promise<Settings | null> => {
  if (repository.get) {
    return repository.get();
  }

  const settings = await repository.findAll?.();
  return settings?.[0] ?? null;
};

export const registerBenchesIpc = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations,
  taskRunner: TaskRunnerLike) => {
  ipcMainLike.handle(ipcChannels.benchesPickFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Bench Directory',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMainLike.handle(ipcChannels.benchesList, async () => {
    const benches = await repositories.benches.findAll();
    return [...benches].sort(byCreatedAtDesc).map(toBenchListItem);
  });

  ipcMainLike.handle(ipcChannels.benchesCreate, async (_event: unknown, input: unknown) => {
    const rawInput = input as BenchCreateInput;
    const { siteName, ...benchPayload } = CreateBenchInputSchema.parse({
      ...rawInput,
      path: resolveUserPath(rawInput.path),
    });
    const normalizedApps = Array.from(new Set(['frappe', ...benchPayload.apps.map(a => a.trim()).filter(Boolean)]));

    const existingSites = await repositories.sites.findAll();
    const duplicateSite = existingSites.find(s => normalizeSiteHost(s.name) === normalizeSiteHost(siteName));
    if (duplicateSite) {
      throw new Error(`A site host "${normalizeSiteHost(siteName)}" already exists. Use a unique initial site name.`);
    }

    const existingBenches = await repositories.benches.findAll();
    const usedPorts = deriveUsedBenchPorts(existingBenches);
    const requestedPort = benchPayload.httpPort;
    const startPort = requestedPort ?? DEFAULT_HTTP_PORT;
    const httpPort = await findNextAvailableTcpPort(startPort, usedPorts);

    const created = await repositories.benches.create({
      ...benchPayload,
      siteName,
      status: 'queued', // Initial state should be queued
      apps: normalizedApps,
      httpPort,
    });

    const settings = await getCurrentSettings(repositories.settings);
    operations.trackBenchOperation?.(created.id, 'create');
    orchestrateBenchCreation(
      created,
      repositories.benches,
      repositories.appCatalog,
      repositories.customApps,
      settings?.shareSshKeys ?? false,
      {
        siteName,
        siteRepo: repositories.sites,
        onCompleted: async () => {
          await operations.refreshFrontDoorHosts?.();
        }
      }
    );

    return toBenchListItem(created);
  });

  ipcMainLike.handle(ipcChannels.benchesUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    const rawInput = input as BenchUpdateInput;
    const payload = UpdateBenchInputSchema.parse({
      ...rawInput,
      ...(typeof rawInput.path === 'string' ? { path: resolveUserPath(rawInput.path) } : {}),
    });

    const benches = await repositories.benches.findAll();
    const existing = benches.find(b => b.id === id);
    if (!existing) {
      return null;
    }

    const requestedApps = Array.isArray(payload.apps)
      ? Array.from(new Set(['frappe', ...payload.apps]))
      : undefined;
    const appsChanged = Array.isArray(requestedApps) && requestedApps.join('\u0000') !== existing.apps.join('\u0000');
    const deferAppsPersistence = appsChanged && existing.status === 'running' && !payload.status;

    const { status: targetStatus, apps: _ignoredApps, ...otherUpdates } = payload;
    void _ignoredApps;
    const persistedUpdates = deferAppsPersistence
      ? otherUpdates
      : {
          ...otherUpdates,
          ...(Array.isArray(requestedApps) ? { apps: requestedApps } : {}),
        };

    let updated = Object.keys(persistedUpdates).length > 0
      ? await repositories.benches.update(id, persistedUpdates)
      : existing;

    if (!updated) {
      return null;
    }

    operations.trackBenchOperation?.(updated.id, 'update');

    if (targetStatus && (targetStatus !== existing.status || targetStatus === 'running')) {
      const status = targetStatus;
      // Do not allow conflicting lifecycle requests while transition is already queued.
      if (existing.status === 'queued') {
        mainLogger.info(`Ignoring bench status change while queued. benchId=${id} target=${status}`);
        return toBenchListItem(updated);
      }

      // Set to queued in DB immediately so UI shows pending state.
      updated = (await repositories.benches.update(id, { status: 'queued' })) ?? updated;

      if (status === 'running') {
        const isRestart = existing.status === 'running';
        const settings = await getCurrentSettings(repositories.settings);
        orchestrateBenchStart(updated, repositories.benches, repositories.customApps, settings?.shareSshKeys ?? false, isRestart);
      } else if (status === 'stopped') {
        orchestrateBenchStop(updated, repositories.benches);
      }
    } else if (targetStatus !== undefined) {
      // Normal status update without orchestration.
      updated = (await repositories.benches.update(id, { status: targetStatus })) ?? updated;
    }

    if (appsChanged && existing.status === 'running' && !targetStatus) {
      const requestedApps = (input as BenchUpdateInput).apps;
      const settings = await getCurrentSettings(repositories.settings);
      orchestrateBenchAppChanges(updated, repositories.benches, repositories.appCatalog, repositories.customApps, settings?.shareSshKeys ?? false, existing.apps, requestedApps ?? []);
    }

    return toBenchListItem(updated);
  });

  ipcMainLike.handle(ipcChannels.benchesDelete, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const bench = await repositories.benches.findById(id);
    if (!bench) {
      return false;
    }

    orchestrateBenchDeletion(bench, repositories.benches, repositories.sites, {
      onDeleted: async () => {
        await operations.refreshFrontDoorHosts?.();
      },
    });

    operations.trackBenchOperation?.(id, 'delete');
    return true;
  });

  ipcMainLike.handle(ipcChannels.benchesLogs, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return [];
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench) {
      return [];
    }

    const logs = toLifecycleLogs(
      bench.id,
      bench.name,
      bench.status,
      bench.path,
      bench.timestamps.createdAt,
      bench.timestamps.updatedAt
    );
    operations.trackBenchOperation?.(bench.id, 'logs-read');
    return logs;
  });

  ipcMainLike.handle(ipcChannels.benchesOpenFolder, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || !fs.existsSync(bench.path)) {
      return false;
    }

    const opened = await operations.openPath(bench.path);
    if (opened) {
      operations.trackBenchOperation?.(bench.id, 'open-folder');
    }
    return opened;
  });

  ipcMainLike.handle(ipcChannels.benchesOpenShell, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || !fs.existsSync(bench.path)) {
      return false;
    }

    if (bench.status !== 'running') {
      mainLogger.warn(`Cannot open shell for bench ${bench.name}: bench is not running.`);
      return false;
    }

    try {
      const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
      const { openBenchShell } = await import('@frappe-local/main/utils');
      const projectName = getComposeProjectName(bench.id);
      const runtimeEnv = await getRuntimeEnv();
      const settings = await getCurrentSettings(repositories.settings);
      await openBenchShell(bench.path, projectName, runtimeEnv, settings?.terminalPreference || 'default');
      operations.trackBenchOperation?.(bench.id, 'open-folder'); // Optional: reuse this or add new 'open-shell'
      return true;
    } catch (error) {
      mainLogger.error(`Failed to open shell for bench ${bench.name}:`, error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.benchesOpenInEditor, async (_event: unknown, id: unknown, inContainer: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || !fs.existsSync(bench.path)) {
      return false;
    }

    if (!inContainer) {
      const opened = await operations.openInEditor(bench.path);
      if (opened && bench.id) operations.trackBenchOperation?.(bench.id, 'open-folder');
      return opened;
    }

    try {
      const { ensureBenchDevcontainer } = await import('@frappe-local/main/services/bench-orchestration');
      const { createDevContainerFolderUri, execPromise, getBinaryPath, resolveEditorCommand } = await import('@frappe-local/main/utils');
      const { getRuntimeEnv } = await import('@frappe-local/main/services/runtime-service');
      const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
      const runtimeEnv: Record<string, string | undefined> = await getRuntimeEnv().catch(() => ({} as Record<string, string | undefined>));
      await ensureBenchDevcontainer(bench.path, { log: () => {} }, 'open-editor', runtimeEnv, bench.id);
      const uri = createDevContainerFolderUri(bench.path, '/workspace');
      const devcontainerBinDir = path.join(bench.path, '.devcontainer', 'bin');
      const podmanBinDir = path.dirname(getBinaryPath('podman'));
      const { command: codeCmd, env: editorEnv } = resolveEditorCommand('code');
      const combinedPath = `${devcontainerBinDir}${path.delimiter}${podmanBinDir}${path.delimiter}${editorEnv.PATH || process.env.PATH || ''}`;
      const composeProjectName = getComposeProjectName(bench.id);
      const execEnv = { ...process.env, ...runtimeEnv, CONTAINER_HOST: runtimeEnv['DOCKER_HOST'] || process.env['DOCKER_HOST'] || process.env['CONTAINER_HOST'] || '', COMPOSE_PROJECT_NAME: composeProjectName, PATH: combinedPath };
      const result = await execPromise(codeCmd, ['--folder-uri', uri], bench.path, undefined, execEnv);
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || `VS Code exited with code ${result.code}`);
      }
      if (bench.id) operations.trackBenchOperation?.(bench.id, 'open-folder');
      return true;
    } catch (error) {
      mainLogger.error(`Failed to open Dev Container for bench ${bench.name}:`, error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.benchesBuild, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || bench.status !== 'running') {
      return false;
    }

    try {
      orchestrateBenchBuild(bench);
      return true;
    } catch (error) {
      mainLogger.error('Failed to orchestrate bench build:', error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.benchesCleanSites, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === id);
    if (!bench || bench.status !== 'running') {
      return false;
    }

    try {
      orchestrateBenchCleaning(bench, repositories.sites);
    } catch (error) {
      mainLogger.error('Failed to clean bench:', error);
      throw error;
    }

    operations.trackBenchOperation?.(id, 'update');
    return true;
  });
};
