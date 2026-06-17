import os from 'node:os';
import path from 'node:path';

export const app = {
  isPackaged: false,
  getAppPath: () => process.cwd(),
  getPath: (name: string) => path.join(os.tmpdir(), `frappe-local-${name}`),
  getVersion: () => '0.1.0',
  getName: () => 'Frappe Local',
};

export class BrowserWindow {
  public static getAllWindows(): BrowserWindow[] {
    return [];
  }

  public readonly webContents = {
    send: () => undefined,
  };

  public isDestroyed(): boolean {
    return false;
  }
}

export const dialog = {
  showOpenDialog: async () => ({
    canceled: true,
    filePaths: [] as string[],
  }),
};

export const shell = {
  openPath: async () => '',
  openExternal: async () => undefined,
};

export const ipcMain = {
  handle: () => undefined,
};

export const ipcRenderer = {
  invoke: async () => undefined,
  on: () => undefined,
  removeListener: () => undefined,
};

export const contextBridge = {
  exposeInMainWorld: () => undefined,
};

export const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: () => undefined,
};
