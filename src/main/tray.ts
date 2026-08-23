import { app, Menu, Tray, BrowserWindow, nativeImage } from 'electron';

let tray: Tray | null = null;

export function setupTray(appIconPath: string, mainWindow: BrowserWindow) {
  if (tray) {
    return tray;
  }

  // Use the same icon that the app uses, but resize it appropriately for a tray icon
  const icon = nativeImage.createFromPath(appIconPath).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Frappe Local',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Frappe Local',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Frappe Local');

  tray.on('right-click', () => {
    tray?.popUpContextMenu(contextMenu);
  });

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });

  return tray;
}
