import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBootstrapContext, runApplicationBootstrap } from './bootstrap';
import { createMainLogger } from './logger';
import { getAppIconPath } from './utils/app-icon';
import { stopCaddyFrontDoor } from './services/caddy-front-door';

let isQuitting = false;
const APP_DISPLAY_NAME = 'Local Bench';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const mainLogger = createMainLogger('main');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const binPath = isDev 
  ? path.resolve(currentDirectory, '../../bin') 
  : path.join(process.resourcesPath, 'bin');

process.env.PATH = `${binPath}${path.delimiter}${process.env.PATH}`;
process.title = APP_DISPLAY_NAME;
app.setName(APP_DISPLAY_NAME);

const configureApplicationMenu = (): void => {
  if (process.platform !== 'darwin') {
    return;
  }

  const appIconPath = getAppIconPath();

  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_DISPLAY_NAME,
      submenu: [
        {
          label: `About ${APP_DISPLAY_NAME}`,
          click: async () => {
            await dialog.showMessageBox({
              type: 'info',
              title: `About ${APP_DISPLAY_NAME}`,
              message: APP_DISPLAY_NAME,
              detail: `Version ${app.getVersion()}\nLocal Frappe experience center.`,
              buttons: ['OK'],
              ...(appIconPath ? { icon: appIconPath } : {}),
            });
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        ...(isDev ? [{ role: 'toggleDevTools' } as MenuItemConstructorOptions, { type: 'separator' } as MenuItemConstructorOptions] : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createMainWindow = async (): Promise<void> => {
  mainLogger.info('creating main window');
  const appIconPath = getAppIconPath();

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#f5f2ea',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#1a1919',
    },
    trafficLightPosition: { x: 8, y: 5 },
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
    ...(appIconPath ? { icon: appIconPath } : {}),
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    mainLogger.error(`renderer failed to load (${errorCode}) ${errorDescription} at ${validatedURL}`);
  });

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      if (process.platform === 'darwin') {
        window.hide();
      } else {
        window.minimize();
      }
    }
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    mainLogger.error(`renderer process exited: ${details.reason} (code: ${details.exitCode})`);
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (!isDev) {
      if (
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.meta && input.alt && input.key.toLowerCase() === 'i') ||
        input.key === 'F12'
      ) {
        event.preventDefault();
      }
    }
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      mainLogger.error(`renderer console [${level}] ${message} (${sourceId}:${line})`);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return;
  }

  await window.loadFile(path.join(currentDirectory, '../renderer/main_window/index.html'));
};

app.whenReady().then(async () => {
  const appIconPath = getAppIconPath();

  process.title = APP_DISPLAY_NAME;
  app.setName(APP_DISPLAY_NAME);

  configureApplicationMenu();

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
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      await createMainWindow();
    } else {
      windows[0].show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    mainLogger.info('all windows closed, quitting application');
    void stopCaddyFrontDoor();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  void stopCaddyFrontDoor();
});