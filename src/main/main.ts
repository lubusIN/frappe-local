import { BrowserWindow, Menu, app, dialog, ipcMain, powerMonitor, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipcChannels } from '@frappe-local/shared/core';
import { createBootstrapContext, runApplicationBootstrap, currentAppLifecycleState } from '@frappe-local/main/bootstrap';
import { createMainLogger } from '@frappe-local/main/logger';
import { getAppIconPath } from '@frappe-local/main/utils';
import { stopCaddyFrontDoor } from '@frappe-local/main/services';
import { setupTray } from '@frappe-local/main/tray';
import {
  isRuntimeRunning,
  stopRuntime,
} from '@frappe-local/main/services/runtime-service';

let isQuitting = false;
let shouldFocusMainWindow = false;
let forceQuit = false;
let isPromptingQuit = false;
const APP_DISPLAY_NAME = 'Frappe Local';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const mainLogger = createMainLogger('main');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

const binPath = isDev
  ? path.resolve(currentDirectory, '../../bin')
  : path.join(process.resourcesPath, 'bin');

process.env.PATH = `${binPath}${path.delimiter}${process.env.PATH}`;
process.title = APP_DISPLAY_NAME;
app.setName(APP_DISPLAY_NAME);

const focusMainWindow = (): boolean => {
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
  if (!window) {
    return false;
  }

  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
  return true;
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // A shortcut can be opened while the primary instance is still booting.
    // Remember that intent and focus the window as soon as bootstrap creates it.
    shouldFocusMainWindow = !focusMainWindow();
  });
}

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
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? [
              { role: 'reload' } as MenuItemConstructorOptions,
              { role: 'forceReload' } as MenuItemConstructorOptions,
            ]
          : [
              {
                label: 'Reload Window',
                click: (_item, focusedWindow) => {
                  if (focusedWindow instanceof BrowserWindow) {
                    focusedWindow.reload();
                  }
                },
              } as MenuItemConstructorOptions,
            ]),
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
    backgroundColor: '#ffffff',
    show: false, // Don't show the window until the UI is ready
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 8, y: 5 },
        }
      : {
          autoHideMenuBar: true,
        }),
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
    ...(appIconPath ? { icon: appIconPath } : {}),
  });

  ipcMain.handle('app:ui-ready', () => {
    window.show();
    window.webContents.send(ipcChannels.appLifecycleState, { state: currentAppLifecycleState });
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    mainLogger.error(`renderer failed to load (${errorCode}) ${errorDescription} at ${validatedURL}`);
  });

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    mainLogger.error(`renderer process exited: ${details.reason} (code: ${details.exitCode})`);
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
      mainLogger.info('Reloading window due to crash...');
      window.reload();
    }
  });

  app.on('child-process-gone', (_event, details) => {
    if (details.type === 'GPU' && details.reason !== 'clean-exit') {
      mainLogger.error(`GPU process crashed: ${details.reason}. Reloading window to recover from white screen.`);
      window.reload();
    }
  });

  powerMonitor.on('resume', () => {
    mainLogger.info('System resumed from sleep. Forcing UI refresh.');
    
    if (process.platform === 'win32') {
      // The OS graphics context may not be fully ready immediately on resume.
      // A small delay allows the GPU to be ready before we force a redraw.
      setTimeout(() => {
        if (window.isDestroyed()) return;
        
        // A visibility toggle often forces a new GPU surface allocation on Windows
        if (window.isVisible()) {
          window.hide();
          window.show();
        }
        
        // Slightly resizing forces Chromium to recalculate layout and repaint
        const bounds = window.getBounds();
        window.setBounds({ width: bounds.width + 1 });
        window.setBounds(bounds);
        
        window.webContents.invalidate();
      }, 1500); // 1.5 seconds delay gives the OS enough time to wake up fully
    }
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

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(currentDirectory, '../renderer/main_window/index.html'));
  }

  if (appIconPath) {
    setupTray(appIconPath, window);
  }
};

if (hasSingleInstanceLock) {
  void app.whenReady().then(async () => {
  const appIconPath = getAppIconPath();

  process.title = APP_DISPLAY_NAME;
  app.setName(APP_DISPLAY_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId('in.lubus.frappe-local');
  }

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

  if (shouldFocusMainWindow) {
    shouldFocusMainWindow = false;
    focusMainWindow();
  }

  app.on('activate', async () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      await createMainWindow();
    } else {
      focusMainWindow();
    }
  });
  }).catch((error) => {
    mainLogger.error(`application startup failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  mainLogger.info('all windows closed, but application will continue running in the background tray');
});

let shouldStopBenchesOnQuit = true;

app.on('before-quit', (event) => {
  if (forceQuit) {
    isQuitting = true;
    if (shouldStopBenchesOnQuit) {
      void stopCaddyFrontDoor();
    }
    return;
  }

  event.preventDefault();

  if (isPromptingQuit) return;
  isPromptingQuit = true;

  isRuntimeRunning().then((isRunning) => {
    if (!isRunning) {
      isPromptingQuit = false;
      forceQuit = true;
      app.quit();
      return;
    }

    dialog.showMessageBox({
      type: 'question',
      buttons: ['Stop Benches & Quit', 'Keep Running & Quit', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Quit Frappe Local',
      message: 'Do you want to stop the local enviornment and services?',
      icon: getAppIconPath(),
    }).then(async ({ response }) => {
      isPromptingQuit = false;
      if (response === 2) {
        return;
      }
      
      if (response === 0) {
        mainLogger.info('User chose to stop benches on quit');
        shouldStopBenchesOnQuit = true;
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          windows[0]?.show();
          windows[0]?.webContents.send(ipcChannels.appLifecycleState, { state: 'stopping' });
        }
        await stopRuntime();
      } else {
        mainLogger.info('User chose to keep benches running on quit');
        shouldStopBenchesOnQuit = false;
      }

      forceQuit = true;
      app.quit();
    }).catch((err) => {
      isPromptingQuit = false;
      mainLogger.error('Failed to show quit dialog: ' + err);
      forceQuit = true;
      app.quit();
    });
  });
});
