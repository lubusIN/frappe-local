import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBootstrapContext, runApplicationBootstrap } from './bootstrap';
import { createMainLogger } from './logger';
import { getAppIconPath } from './app-icon';

const APP_DISPLAY_NAME = 'Frappe Cafe';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const mainLogger = createMainLogger('main');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const binPath = isDev 
  ? path.resolve(currentDirectory, '../../bin') 
  : path.join(process.resourcesPath, 'bin');

process.env.PATH = `${binPath}${path.delimiter}${process.env.PATH}`;
app.setName(APP_DISPLAY_NAME);

const createMainWindow = async (): Promise<void> => {
  mainLogger.info('creating main window');
  const appIconPath = getAppIconPath();

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#f5f2ea',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(appIconPath ? { icon: appIconPath } : {}),
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    mainLogger.error(`renderer failed to load (${errorCode}) ${errorDescription} at ${validatedURL}`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    mainLogger.error(`renderer process exited: ${details.reason} (code: ${details.exitCode})`);
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      mainLogger.error(`renderer console [${level}] ${message} (${sourceId}:${line})`);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await window.loadFile(path.join(currentDirectory, '../renderer/main_window/index.html'));
};

app.whenReady().then(async () => {
  const appIconPath = getAppIconPath();

  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: APP_DISPLAY_NAME,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      ...(appIconPath ? { iconPath: appIconPath } : {}),
    });
  }

  if (process.platform === 'darwin' && appIconPath && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  const bootstrapContext = createBootstrapContext(APP_DISPLAY_NAME, app.getVersion(), createMainWindow, app);
  await runApplicationBootstrap(bootstrapContext, ipcMain);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    mainLogger.info('all windows closed, quitting application');
    app.quit();
  }
});