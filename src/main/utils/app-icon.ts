import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

const resolveIconPath = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }

  return path.resolve(currentDirectory, '../../resources/icons/icon.png');
};

const getAppIconPath = (): string | undefined => {
  const iconPath = resolveIconPath();
  return fs.existsSync(iconPath) ? iconPath : undefined;
};

export { getAppIconPath };
