import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBootstrapContext, runApplicationBootstrap } from './bootstrap';
import { createMainLogger } from './logger';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const mainLogger = createMainLogger('main');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const binPath = isDev 
  ? path.resolve(currentDirectory, '../../bin') 
  : path.join(process.resourcesPath, 'bin');

process.env.PATH = `${binPath}${path.delimiter}${process.env.PATH}`;

const createMainWindow = async (): Promise<void> => {
  mainLogger.info('creating main window');

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
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await window.loadFile(path.join(currentDirectory, '../renderer/main_window/index.html'));
};

app.whenReady().then(async () => {
  const bootstrapContext = createBootstrapContext(app.getName(), app.getVersion(), createMainWindow, app);
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