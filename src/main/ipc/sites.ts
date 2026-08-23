import type { IpcMainLike, AppRepositories, IpcOperations } from '../ipc';

import type { LifecycleLogItem, SiteCreateInput, SiteListItem, SiteUpdateInput } from '@frappe-local/shared/core';
import { getRuntimeEnv, orchestrateSiteAppsUpdate, orchestrateSiteCreation, orchestrateSiteDeletion } from '@frappe-local/main/services';

import { filterNonCoreApps, ipcChannels } from '@frappe-local/shared/core';
import { DEFAULT_HTTP_PORT, resolveBenchHttpPort } from '@frappe-local/main/utils';

import { createMainLogger } from '@frappe-local/main/logger';

import { normalizeSiteHost } from '@frappe-local/shared/utils/site-hostname';

const mainLogger = createMainLogger('ipc');

import fs from 'node:fs';
import { CreateSiteInputSchema, UpdateSiteInputSchema, canTransitionSiteStatus, isBenchReadyForSiteStatus, type Settings, type Site } from '@frappe-local/shared/domain';

const toSiteListItem = (site: Site): SiteListItem => ({
  id: site.id,
  name: site.name,
  benchId: site.benchId,
  status: site.status,
  path: site.path,
  appCount: filterNonCoreApps(site.apps).length,
  apps: site.apps,
  createdAt: site.timestamps.createdAt,
  updatedAt: site.timestamps.updatedAt,
});

const byCreatedAtDesc = <T extends { timestamps: { createdAt: string } }>(left: T, right: T): number =>
  right.timestamps.createdAt.localeCompare(left.timestamps.createdAt);

const hasDuplicateSiteHost = (
  sites: Site[],
  candidateName: string,
  excludeSiteId?: string
): boolean => {
  const candidateHost = normalizeSiteHost(candidateName);
  if (!candidateHost) {
    return false;
  }

  return sites.some((site) => {
    if (excludeSiteId && site.id === excludeSiteId) {
      return false;
    }

    return normalizeSiteHost(site.name) === candidateHost;
  });
};


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



export const registerSitesIpc = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations) => {
  ipcMainLike.handle(ipcChannels.sitesList, async () => {
    const sites = await repositories.sites.findAll();
    return [...sites].sort(byCreatedAtDesc).map(toSiteListItem);
  });

  ipcMainLike.handle(ipcChannels.sitesCreate, async (_event: unknown, input: unknown) => {
    const payload = CreateSiteInputSchema.parse(input as SiteCreateInput);
    const existingSites = await repositories.sites.findAll();
    const duplicateSite = existingSites.find(s => normalizeSiteHost(s.name) === normalizeSiteHost(payload.name));
    if (duplicateSite) {
      throw new Error(`A site host "${normalizeSiteHost(payload.name)}" already exists. Use a unique site name.`);
    }

    const bench = await repositories.benches.findById(payload.benchId);
    if (!bench) {
      throw new Error('Cannot create site: parent bench was not found.');
    }
    if (bench.status !== 'running') {
      throw new Error(`Cannot create site. Bench "${bench.name}" is not running. Please start the bench first.`);
    }

    const customAppsList = await repositories.customApps.findAll();
    const isAppOnBench = (app: string) => {
      if (bench.apps.includes(app)) return true;
      const customApp = customAppsList.find((c) => c.id === app || c.name === app);
      return customApp ? bench.apps.includes(customApp.id) || bench.apps.includes(customApp.name) : false;
    };
    const unavailableApps = filterNonCoreApps(payload.apps).filter((app) => !isAppOnBench(app));
    if (unavailableApps.length > 0) {
      throw new Error(`Cannot create site with apps not installed on bench: ${unavailableApps.join(', ')}`);
    }

    const created = await orchestrateSiteCreation(repositories, payload, {
      onCompleted: async () => {
        await operations.refreshFrontDoorHosts?.();
      },
    });
    operations.trackSiteOperation?.(created.id, 'create');
    return toSiteListItem(created);
  });

  ipcMainLike.handle(ipcChannels.sitesUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    const payload = UpdateSiteInputSchema.parse(input as SiteUpdateInput);

    const sites = await repositories.sites.findAll();
    const existing = sites.find((entry) => entry.id === id);
    if (!existing) {
      return null;
    }
    if (existing.status === 'queued' && payload.status) {
      return toSiteListItem(existing);
    }

    const targetSiteName = payload.name ?? existing.name;
    if (hasDuplicateSiteHost(sites, targetSiteName, existing.id)) {
      throw new Error(`A site host "${normalizeSiteHost(targetSiteName)}" already exists. Use a unique site name.`);
    }

    const targetSiteStatus = payload.status ?? existing.status;
    if (!canTransitionSiteStatus(existing.status, targetSiteStatus)) {
      return null;
    }

    const targetBenchId = payload.benchId ?? existing.benchId;
    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === targetBenchId);
    if (!bench) {
      return null;
    }

    const { status: targetStatus, ...otherUpdates } = payload;
    if (!isBenchReadyForSiteStatus(bench.status, targetSiteStatus)) {
      throw new Error(`Bench "${bench.name}" is not running. Please start the bench before updating its sites.`);
    }

    const requestedApps = Array.isArray(payload.apps)
      ? Array.from(new Set(payload.apps.map((app) => app.trim()).filter(Boolean)))
      : null;

    if (requestedApps) {
      if (existing.status !== 'ready' && existing.status !== 'failure') {
        throw new Error('Site must be ready or in failure state before activating apps.');
      }

      const appsToInstall = requestedApps.filter((app) => !existing.apps.includes(app));
      const removedApps = existing.apps.filter((app) => !requestedApps.includes(app));

      if (appsToInstall.length === 0 && removedApps.length === 0) {
        return toSiteListItem(existing);
      }

      const queuedSite = (await repositories.sites.update(id, { status: 'queued' })) ?? existing;
      operations.trackSiteOperation?.(queuedSite.id, 'update');

      orchestrateSiteAppsUpdate(repositories, existing, requestedApps, {
        onCompleted: async () => {
          await operations.refreshFrontDoorHosts?.();
        },
      });
      return toSiteListItem(queuedSite);
    }

    const { apps: _ignoredApps, ...safeOtherUpdates } = otherUpdates;
    void _ignoredApps;
    let updated = await repositories.sites.update(id, safeOtherUpdates);

    if (updated) {
      operations.trackSiteOperation?.(updated.id, 'update');
      await operations.refreshFrontDoorHosts?.();

      if (targetStatus && targetStatus !== existing?.status) {
        updated = (await repositories.sites.update(id, { status: targetStatus })) ?? updated;
      }
    }
    return updated ? toSiteListItem(updated) : null;
  });

  ipcMainLike.handle(ipcChannels.sitesDelete, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      throw new Error('Invalid site ID provided.');
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site) {
      throw new Error('Site not found.');
    }

    const bench = await repositories.benches.findById(site.benchId);
    if (bench && bench.status !== 'running') {
      throw new Error(`Cannot delete site. Its parent bench "${bench.name}" is not running. Please start the bench first.`);
    }

    const result = await orchestrateSiteDeletion(repositories, id, {
      onDeleted: async () => {
        await operations.refreshFrontDoorHosts?.();
      },
    });
    if (result) {
      operations.trackSiteOperation?.(id, 'delete');
    }
    return result;
  });

  ipcMainLike.handle(ipcChannels.sitesCleanCache, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      throw new Error('Invalid site ID provided.');
    }

    const { orchestrateSiteCleanCache } = await import('@frappe-local/main/services/site-orchestration');
    return orchestrateSiteCleanCache(repositories, id);
  });

  ipcMainLike.handle(ipcChannels.sitesMigrate, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      throw new Error('Invalid site ID provided.');
    }

    const { orchestrateSiteMigrate } = await import('@frappe-local/main/services/site-orchestration');
    return orchestrateSiteMigrate(repositories, id);
  });

  ipcMainLike.handle(ipcChannels.sitesLogs, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return [];
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site) {
      return [];
    }

    const logs = toLifecycleLogs(
      site.id,
      site.name,
      site.status,
      site.path,
      site.timestamps.createdAt,
      site.timestamps.updatedAt
    );
    operations.trackSiteOperation?.(site.id, 'logs-read');
    return logs;
  });

  ipcMainLike.handle(ipcChannels.sitesOpenFolder, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site || !fs.existsSync(site.path)) {
      return false;
    }

    const opened = await operations.openPath(site.path);
    if (opened) {
      operations.trackSiteOperation?.(site.id, 'open-folder');
    }
    return opened;
  });

  ipcMainLike.handle(ipcChannels.sitesOpenShell, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site || (process.platform !== 'win32' && !fs.existsSync(site.path))) {
      return false;
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === site.benchId);
    if (!bench || bench.status !== 'running') {
      mainLogger.warn(`Cannot open shell for site ${site.name}: parent bench is not running.`);
      return false;
    }

    try {
      const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
      const { openSiteShell } = await import('@frappe-local/main/utils');
      const projectName = getComposeProjectName(bench.id);
      const runtimeEnv = await getRuntimeEnv();
      const settings = await getCurrentSettings(repositories.settings);
      await openSiteShell(bench.path, projectName, site.name, runtimeEnv, settings?.terminalPreference || 'default');
      operations.trackSiteOperation?.(site.id, 'open-folder'); // Using open-folder or similar
      return true;
    } catch (error) {
      mainLogger.error(`Failed to open shell for site ${site.name}:`, error);
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.sitesOpenExternal, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return false;
    }

    const sites = await repositories.sites.findAll();
    const site = sites.find((entry) => entry.id === id);
    if (!site) {
      return false;
    }

    const preferredHost = normalizeSiteHost(site.name);
    const frontDoorAvailable = operations.isFrontDoorAvailable?.() ?? false;
    if (frontDoorAvailable) {
      const protocol = operations.isFrontDoorSecure?.() ? 'https' : 'http';
      return operations.openExternal(`${protocol}://${preferredHost}`);
    }

    const benches = await repositories.benches.findAll();
    const bench = benches.find((entry) => entry.id === site.benchId);
    const fallbackPort = bench ? resolveBenchHttpPort(bench, DEFAULT_HTTP_PORT) : DEFAULT_HTTP_PORT;
    const url = `http://${preferredHost}:${fallbackPort}`;
    const opened = await operations.openExternal(url);
    if (opened) {
      // open-external is not a valid SiteLifecycleOperation, ignoring track
    }
    return opened;
  });
};
