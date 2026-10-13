
import type { IpcMainLike, AppRepositories, IpcOperations } from '../ipc';

import type { CatalogAppItem } from '@frappe-local/shared/core';
import { extractCustomApp, fetchBreweryCatalog, syncAppCatalogFromBrewery } from '@frappe-local/main/services';

import { ipcChannels } from '@frappe-local/shared/core';

import { createMainLogger } from '@frappe-local/main/logger';

const mainLogger = createMainLogger('ipc');

import fs from 'node:fs';
import path from 'node:path';
import { CreateCustomAppInputSchema, UpdateCustomAppInputSchema } from '@frappe-local/shared/domain';

export const registerAppsIpc = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations) => {
  ipcMainLike.handle(ipcChannels.appsOpenInEditor, async (_event: unknown, benchId: unknown, appName: unknown, inContainer: unknown) => {
    if (typeof appName !== 'string') {
      return false;
    }

    const benches = await repositories.benches.findAll();
    let bench = typeof benchId === 'string' ? benches.find((b) => b.id === benchId) ?? null : null;

    const customApps = await repositories.customApps.findAll();
    const customApp = customApps.find((a) => a.id === appName || a.name === appName || a.title === appName);

    if (!bench) {
      const possibleIdentifiers = new Set([appName, customApp?.name, customApp?.id].filter(Boolean) as string[]);
      bench = benches.find((b) => (inContainer ? b.status === 'running' : true) && b.apps?.some((a) => possibleIdentifiers.has(a))) ?? null;
      if (!bench && inContainer) {
        bench = benches.find((b) => b.apps?.some((a) => possibleIdentifiers.has(a))) ?? null;
      }
      if (!bench) {
        bench = benches.find((b) => {
          if (!fs.existsSync(path.join(b.path, 'apps'))) return false;
          const dirs = fs.readdirSync(path.join(b.path, 'apps'));
          return dirs.some((d) => possibleIdentifiers.has(d) || dirs.some((dir) => dir.replace(/[-_]/g, '').toLowerCase() === (customApp?.name || appName).replace(/[-_]/g, '').toLowerCase()));
        }) ?? null;
      }
    }

    if (!inContainer && customApp && customApp.type === 'local' && customApp.source && fs.existsSync(customApp.source)) {
      return operations.openInEditor(customApp.source);
    }

    if (!bench) {
      if (inContainer) {
        mainLogger.warn(`Cannot open Dev Container for app ${appName}: no bench found with this app.`);
      }
      return false;
    }

    let folderName = customApp?.name || appName;
    if (fs.existsSync(path.join(bench.path, 'apps'))) {
      const dirs = fs.readdirSync(path.join(bench.path, 'apps'));
      const target = dirs.find((d) => d === customApp?.name || d === appName)
        || dirs.find((d) => d.toLowerCase() === (customApp?.name || appName).toLowerCase())
        || dirs.find((d) => d.replace(/[-_]/g, '').toLowerCase() === (customApp?.name || appName).replace(/[-_]/g, '').toLowerCase());
      if (target) {
        folderName = target;
      }
    }

    if (inContainer) {
      try {
        const { ensureBenchDevcontainer } = await import('@frappe-local/main/services/bench-orchestration');
        const { createDevContainerFolderUri, execPromise, getBinaryPath, resolveEditorCommand } = await import('@frappe-local/main/utils');
        const { getRuntimeEnv } = await import('@frappe-local/main/services/runtime-service');
        const { getComposeProjectName } = await import('@frappe-local/main/utils/podman');
        const runtimeEnv: Record<string, string | undefined> = await getRuntimeEnv().catch(() => ({} as Record<string, string | undefined>));
        await ensureBenchDevcontainer(bench.path, { log: () => {} }, 'open-editor', runtimeEnv, bench.id);
        const uri = createDevContainerFolderUri(bench.path, `/workspace/apps/${folderName}`);
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
        mainLogger.error(`Failed to open Dev Container for app ${appName}:`, error);
        return false;
      }
    }

    const appFolderPath = path.join(bench.path, 'apps', folderName);
    if (fs.existsSync(appFolderPath)) {
      return operations.openInEditor(appFolderPath);
    }

    return false;
  });

  ipcMainLike.handle(ipcChannels.catalogList, async () => {
    return repositories.appCatalog.findAll();
  });

  ipcMainLike.handle(ipcChannels.catalogFindById, async (_event: unknown, id: unknown) => {
    if (typeof id !== 'string') {
      return null;
    }

    if (repositories.appCatalog.findById) {
      return repositories.appCatalog.findById(id);
    }

    const apps = await repositories.appCatalog.findAll();
    return apps.find((app) => app.id === id) ?? null;
  });

  ipcMainLike.handle(ipcChannels.catalogSearch, async (_event: unknown, query: unknown) => {
    if (typeof query !== 'string') {
      return [];
    }

    if (repositories.appCatalog.search) {
      return repositories.appCatalog.search(query);
    }

    const normalized = query.trim().toLowerCase();
    const apps = await repositories.appCatalog.findAll();
    if (!normalized) {
      return apps;
    }

    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(normalized) ||
        app.description.toLowerCase().includes(normalized)
    );
  });

  ipcMainLike.handle(ipcChannels.catalogSync, async (_event: unknown, apps: unknown) => {
    if (!Array.isArray(apps) || !repositories.appCatalog.sync) {
      return false;
    }

    await repositories.appCatalog.sync(apps as CatalogAppItem[]);
    return true;
  });

  ipcMainLike.handle(ipcChannels.catalogValidateBrewery, async (_event: unknown, url: unknown) => {
    const targetUrl = typeof url === 'string' ? url : undefined;
    const result = await fetchBreweryCatalog(targetUrl);
    if (result.success) {
      return { valid: true, appCount: result.apps.length };
    }
    return { valid: false, error: result.error };
  });

  ipcMainLike.handle(ipcChannels.catalogSyncBrewery, async (_event: unknown, url: unknown) => {
    const targetUrl = typeof url === 'string' ? url : undefined;
    if (!repositories.appCatalog.sync) {
      return { success: false, error: 'Catalog repository sync unavailable' };
    }
    const result = await syncAppCatalogFromBrewery(targetUrl, repositories.appCatalog);
    if (result.success) {
      return { success: true, appCount: result.apps.length };
    }
    return { success: false, error: result.error };
  });

  ipcMainLike.handle(ipcChannels.customAppsList, async () => {
    return repositories.customApps.findAll();
  });

  ipcMainLike.handle(ipcChannels.customAppsCreate, async (_event: unknown, input: unknown) => {
    return repositories.customApps.create(CreateCustomAppInputSchema.parse(input));
  });

  ipcMainLike.handle(ipcChannels.customAppsUpdate, async (_event: unknown, id: unknown, input: unknown) => {
    return repositories.customApps.update(String(id), UpdateCustomAppInputSchema.parse(input));
  });

  ipcMainLike.handle(ipcChannels.customAppsDelete, async (_event: unknown, id: unknown) => {
    return repositories.customApps.delete(id as string);
  });

  ipcMainLike.handle(ipcChannels.customAppsExtract, async (_event: unknown, type: unknown, source: unknown) => {
    return extractCustomApp(type as 'github' | 'local', source as string);
  });

  ipcMainLike.handle(ipcChannels.appsCheckUsage, async (_event: unknown, identifiers: unknown, benchId?: unknown) => {
    const benches = await repositories.benches.findAll();
    const sites = await repositories.sites.findAll();
    
    let usedBenches: string[] = [];
    let usedSites: string[] = [];
    
    const ids = Array.isArray(identifiers) ? identifiers : [identifiers];

    const isAppInList = (appList: string[] | undefined) => {
      if (!appList) return false;
      return appList.some((appName) => ids.includes(appName));
    };
    
    if (benchId) {
      // Check if any site on the specified bench uses this app
      const sitesOnBench = sites.filter(s => s.benchId === benchId);
      usedSites = sitesOnBench.filter(s => isAppInList(s.apps)).map(s => s.name);
    } else {
      // Global check: check all benches and all sites
      usedBenches = benches.filter(b => isAppInList(b.apps)).map(b => b.name);
      usedSites = sites.filter(s => isAppInList(s.apps)).map(s => s.name);
    }
    
    return {
      inUse: usedBenches.length > 0 || usedSites.length > 0,
      benches: usedBenches,
      sites: usedSites,
    };
  });
};
