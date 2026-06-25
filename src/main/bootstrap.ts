import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { IpcMain } from 'electron';
import { BrowserWindow, app, nativeTheme, shell } from 'electron';
import type { AppRepositories } from '@frappe-local/main/ipc';
import { registerIpcHandlers } from '@frappe-local/main/ipc';
import { createMainLogger } from '@frappe-local/main/logger';
import type { AppRuntimePaths } from '@frappe-local/main/config';
import { resolveAppRuntimePaths } from '@frappe-local/main/config';
import { JsonStorageAdapter, initializeStorage } from '@frappe-local/main/storage';

import { AppCatalogRepository, BenchRepository, CustomAppsRepository, SettingsRepository, SiteRepository } from '@frappe-local/main/storage/repositories';

import { APP_CATALOG_SEED_VERSION, analytics, applyPodmanMachineMemory, configurePodmanMemoryProvider, getDefaultAppCatalogSeed, initializeCaddyFrontDoor, isCaddyFrontDoorAvailable, isCaddyFrontDoorRunning, isCaddyFrontDoorSecure, runDiagnostics } from '@frappe-local/main/services';

import { getAppIconPath } from '@frappe-local/main/utils';

import { getRecommendedPodmanMemoryMb } from '@frappe-local/shared/core';
import { initializeUpdater } from '@frappe-local/main/updater';

type BootstrapContext = {
  readonly registerHandlers: typeof registerIpcHandlers;
  readonly createMainWindow: () => Promise<void>;
  readonly appName: string;
  readonly appVersion: string;
  readonly runtimePaths: AppRuntimePaths;
};

const bootstrapLogger = createMainLogger('bootstrap');

const splitCommand = (commandLine: string): string[] => {
  return commandLine.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) ?? [];
};

const openInEditor = async (targetPath: string, editorPreference: string): Promise<boolean> => {
  const [command, ...args] = splitCommand(editorPreference.trim() || 'code');
  if (!command) {
    return false;
  }

  try {
    const childProcess = spawn(command, [...args, targetPath], {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    childProcess.unref();
    return true;
  } catch {
    bootstrapLogger.warn(`failed to open editor for ${targetPath}`);
    return false;
  }
};

const buildStartupErrorHtml = (appName: string): string => {
  const safeName = appName.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safeName} Startup Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px; background: #f7f3ea; color: #2f2116; }
          .card { max-width: 740px; margin: 0 auto; border: 1px solid #d3c5b5; border-radius: 18px; background: #fffaf3; padding: 28px; box-shadow: 0 16px 48px rgba(40, 24, 8, 0.12); }
          h1 { margin: 0 0 12px; font-size: 30px; line-height: 1.1; }
          p { margin: 10px 0; line-height: 1.6; }
          code { background: #f3eadf; padding: 2px 6px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>${safeName} could not finish startup.</h1>
          <p>The application encountered an initialization error.</p>
          <p>Check application logs for details and retry launch.</p>
          <p>If the issue persists, remove temporary build outputs and restart the app.</p>
        </section>
      </body>
    </html>
  `;
};

export const createBootstrapContext = (
  appName: string,
  appVersion: string,
  createMainWindow: () => Promise<void>,
  appPathReader: { getPath: (name: 'userData' | 'logs') => string }
): BootstrapContext => ({
  registerHandlers: registerIpcHandlers,
  createMainWindow,
  appName,
  appVersion,
  runtimePaths: resolveAppRuntimePaths(appPathReader),
});

export const runApplicationBootstrap = async (
  context: BootstrapContext,
  ipcMain: IpcMain
): Promise<void> => {
  bootstrapLogger.info(`resolved runtime paths at ${context.runtimePaths.userDataPath}`);
  bootstrapLogger.info(`config path stub: ${path.normalize(context.runtimePaths.configPath)}`);
  bootstrapLogger.info(`storage path stub: ${path.normalize(context.runtimePaths.storagePath)}`);

  try {
    const storageFilePath = path.join(context.runtimePaths.storagePath, 'storage.json');
    const adapter = new JsonStorageAdapter(storageFilePath);
    await adapter.connect();
    await initializeStorage(adapter, storageFilePath, {
      appCatalogSeed: getDefaultAppCatalogSeed(),
      appCatalogSeedVersion: APP_CATALOG_SEED_VERSION,
    });

    const settingsRepository = new SettingsRepository(adapter);
    configurePodmanMemoryProvider(async () => {
      const settings = await settingsRepository.get();
      return settings?.podmanMemoryMb
        ?? getRecommendedPodmanMemoryMb(os.totalmem() / (1024 * 1024));
    });
    const repositories = {
      appCatalog: new AppCatalogRepository(adapter),
      benches: new BenchRepository(adapter),
      sites: new SiteRepository(adapter),
      settings: settingsRepository,
      customApps: new CustomAppsRepository(adapter),
    } satisfies AppRepositories;

    const currentSettings = await settingsRepository.get();
    nativeTheme.themeSource = currentSettings?.theme ?? 'system';

    const refreshCaddyFrontDoorHosts = async (): Promise<void> => {
      const caddyReady = await initializeCaddyFrontDoor({ benches: repositories.benches, sites: repositories.sites });
      if (!caddyReady) {
        bootstrapLogger.warn('Caddy front door is unavailable. Falling back to port-based site URLs.');
      }
    };

    // Initialize Caddy front door asynchronously in the background so it doesn't block window creation
    refreshCaddyFrontDoorHosts().catch((error) => {
      bootstrapLogger.warn(`Caddy front door background initialization failed: ${error}`);
    });

    context.registerHandlers(ipcMain, repositories, {
      openPath: async (targetPath: string) => {
        const result = await shell.openPath(targetPath);
        return result === '';
      },
      openExternal: async (url: string) => {
        try {
          await shell.openExternal(url);
          return true;
        } catch {
          return false;
        }
      },
      openInEditor: async (targetPath: string) => {
        const settings = await settingsRepository.findAll();
        const editorPreference = settings[0]?.editorPreference || 'code';
        return openInEditor(targetPath, editorPreference);
      },
      pathExists: (targetPath: string) => fs.existsSync(targetPath),
      isFrontDoorAvailable: () => isCaddyFrontDoorAvailable(),
      isFrontDoorSecure: () => isCaddyFrontDoorSecure(),
      refreshFrontDoorHosts: async () => {
        try {
          await refreshCaddyFrontDoorHosts();
        } catch (error) {
          bootstrapLogger.warn(`Failed to refresh Caddy front door hosts: ${error}`);
        }
      },
      applyRuntimeMemory: applyPodmanMachineMemory,
      trackBenchOperation: (id, op) => analytics.trackOperation(id, op),
      trackSiteOperation: (id, op) => analytics.trackOperation(id, op),
    }, undefined, context.appVersion, context.runtimePaths);
    
    await context.createMainWindow();

    // Initialize auto-updater
    setTimeout(() => {
      initializeUpdater(settingsRepository).catch((err) => bootstrapLogger.error('Failed to initialize updater', err));
    }, 3000);

    bootstrapLogger.info('startup sequence completed');

    // Run initial diagnostics in background after a short delay
    setTimeout(() => {
      runDiagnostics({
        runtimePaths: context.runtimePaths,
        settingsRepository: {
          get: async () => {
            const settings = await settingsRepository.findAll();
            return settings[0] || null;
          },
        },
        appVersion: context.appVersion,
      }).catch((err) => bootstrapLogger.error('Initial background diagnostics failed', err));
    }, 1000);
  } catch (error) {
    bootstrapLogger.error('startup sequence failed', error);
    const appIconPath = getAppIconPath();

    const fallbackWindow = new BrowserWindow({
      width: 920,
      height: 620,
      minWidth: 760,
      minHeight: 520,
      backgroundColor: '#f7f3ea',
      ...(appIconPath ? { icon: appIconPath } : {}),
    });

    await fallbackWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildStartupErrorHtml(context.appName))}`);
  }
};

export { buildStartupErrorHtml };
