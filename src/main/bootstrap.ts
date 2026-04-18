import path from 'node:path';
import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import type { AppRepositories } from './ipc';
import { registerIpcHandlers } from './ipc';
import { createMainLogger } from './logger';
import type { AppRuntimePaths } from './config';
import { resolveAppRuntimePaths } from './config';
import { JsonStorageAdapter } from './storage/adapter';
import { initializeStorage } from './storage/bootstrap';
import { AppCatalogRepository } from './storage/repositories/app-catalog-repository';
import { BenchRepository } from './storage/repositories/bench-repository';

type BootstrapContext = {
  readonly registerHandlers: (ipcMain: IpcMain, repositories: AppRepositories) => void;
  readonly createMainWindow: () => Promise<void>;
  readonly appName: string;
  readonly runtimePaths: AppRuntimePaths;
};

const bootstrapLogger = createMainLogger('bootstrap');

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
          <p>Check terminal logs for details and retry launch.</p>
          <p>If the issue persists, remove temporary build outputs and restart the app.</p>
        </section>
      </body>
    </html>
  `;
};

export const createBootstrapContext = (
  appName: string,
  createMainWindow: () => Promise<void>,
  appPathReader: { getPath: (name: 'userData' | 'logs') => string }
): BootstrapContext => ({
  registerHandlers: registerIpcHandlers,
  createMainWindow,
  appName,
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
    await initializeStorage(adapter, storageFilePath, { appCatalogSeed: [], appCatalogSeedVersion: 1 });

    const repositories: AppRepositories = {
      appCatalog: new AppCatalogRepository(adapter),
      benches: new BenchRepository(adapter),
    };

    context.registerHandlers(ipcMain, repositories);
    await context.createMainWindow();
    bootstrapLogger.info('startup sequence completed');
  } catch (error) {
    bootstrapLogger.error('startup sequence failed', error);

    const fallbackWindow = new BrowserWindow({
      width: 920,
      height: 620,
      minWidth: 760,
      minHeight: 520,
      backgroundColor: '#f7f3ea',
    });

    await fallbackWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildStartupErrorHtml(context.appName))}`);
  }
};

export { buildStartupErrorHtml };