import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { ipcChannels, type UpdateCheckResult } from '@frappe-local/shared/core';
import type { Settings } from '@frappe-local/shared/domain';
import { createMainLogger } from '@frappe-local/main/logger';
import type { SettingsRepository } from '@frappe-local/main/storage/repositories';

const updaterLogger = createMainLogger('updater');

export const configureUpdater = (settings: Settings | null): void => {
  try {
    if (!settings) return;

    if (!app.isPackaged) {
      updaterLogger.info('dev mode: skipping auto updater configuration');
      return;
    }

    if (!settings.autoUpdateEnabled) {
      updaterLogger.info('auto updates are disabled in settings');
      autoUpdater.autoDownload = false;
    } else {
      autoUpdater.autoDownload = true;
    }

    if (settings.updateChannel === 'stable') {
      autoUpdater.channel = 'latest';
      autoUpdater.allowPrerelease = true;
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'lubusIN',
        repo: 'frappe-local',
      });
    } else {
      autoUpdater.channel = 'dev';
      autoUpdater.allowPrerelease = true;
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: 'https://github.com/lubusIN/frappe-local/releases/download/dev',
        channel: 'dev'
      });
    }

    updaterLogger.info(`configured updater on channel: ${autoUpdater.channel}`);
  } catch (error) {
    updaterLogger.error('Error in configureUpdater: ' + (error as Error).message);
  }
};

const isGracefulUpdateError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>).code;
  const message = String((error as Record<string, unknown>).message ?? '');
  return code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' || message.includes('404');
};

export const initializeUpdater = async (settingsRepository: SettingsRepository): Promise<void> => {
  if (!app.isPackaged) {
    autoUpdater.updateConfigPath = path.join(process.cwd(), 'resources', 'dev-update.yml');
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.logger = {
    info: (message: string) => updaterLogger.info(message),
    warn: (message: string) => updaterLogger.warn(message),
    error: (message: string) => updaterLogger.error(message),
    debug: (message: string) => updaterLogger.debug(message),
  };

  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown update error');
    if (isGracefulUpdateError(error)) {
      updaterLogger.info(`Graceful update notice: ${message}`);
      return;
    }
    updaterLogger.error('AutoUpdater error encountered:', error);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(ipcChannels.updateError, message);
    });
  });

  autoUpdater.on('update-available', (info) => {
    updaterLogger.info(`Update available: ${info.version}`);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(ipcChannels.updateAvailable, info.version);
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updaterLogger.info(`Update downloaded from remote: ${info.version}`);

    if (process.platform === 'darwin') {
      const macUpdater = autoUpdater as unknown as {
        squirrelDownloadedUpdate?: boolean;
        nativeUpdater?: {
          once?: (event: string, listener: (err?: unknown) => void) => void;
        };
      };

      if (!macUpdater.squirrelDownloadedUpdate && macUpdater.nativeUpdater?.once) {
        updaterLogger.info('macOS: Waiting for native Squirrel.Mac to verify and unpack update package...');
        macUpdater.nativeUpdater.once('update-downloaded', () => {
          updaterLogger.info(`macOS: Squirrel.Mac verified and unpacked update: ${info.version}`);
          BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send(ipcChannels.updateDownloaded, info.version);
          });
        });
        macUpdater.nativeUpdater.once('error', (error) => {
          const message = error instanceof Error ? error.message : String(error ?? 'Squirrel.Mac verification failed');
          updaterLogger.error('macOS: Squirrel.Mac verification/unpack error:', error);
          BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send(ipcChannels.updateError, `Verification/unpack failed: ${message}`);
          });
        });
        return;
      }
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(ipcChannels.updateDownloaded, info.version);
    });
  });

  autoUpdater.autoInstallOnAppQuit = true;

  try {
    const settings = await settingsRepository.get();
    configureUpdater(settings);

    await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    if (isGracefulUpdateError(error)) {
      updaterLogger.info('No update metadata found on remote channel.');
    } else {
      updaterLogger.error('failed to initialize auto updater', error);
    }
  }
};

export const triggerManualUpdateCheck = async (): Promise<UpdateCheckResult> => {
  if (!app.isPackaged) {
    return {
      checkedAt: new Date().toISOString(),
      source: 'manual',
      status: 'not-configured',
      message: 'Update checks are only available in packaged builds.',
    };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    updaterLogger.info('Manual update check result: ' + JSON.stringify(result?.updateInfo));
    
    const isAvailable = result && result.updateInfo && result.updateInfo.version !== autoUpdater.currentVersion.version;

    return {
      checkedAt: new Date().toISOString(),
      source: 'manual',
      status: isAvailable ? 'update-available' : 'up-to-date',
      message: isAvailable ? `Update available: ${result.updateInfo.version}` : 'You are on the latest version.',
    };
  } catch (error) {
    if (isGracefulUpdateError(error)) {
      updaterLogger.info('Manual check: no update metadata found on remote channel.');
      return {
        checkedAt: new Date().toISOString(),
        source: 'manual',
        status: 'up-to-date',
        message: 'No published releases found for this channel.',
      };
    }
    updaterLogger.error('manual update check failed', error);
    return {
      checkedAt: new Date().toISOString(),
      source: 'manual',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred.',
    };
  }
};

export const triggerUpdateDownload = async (): Promise<void> => {
  updaterLogger.info('Triggering update download via IPC...');
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(ipcChannels.updateDownloading);
  });
  if (!app.isPackaged) {
    updaterLogger.info('Dev mode: Simulating update download...');
    setTimeout(() => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(ipcChannels.updateDownloaded, autoUpdater.currentVersion.version);
      });
    }, 1500);
    return;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    updaterLogger.error('Update download failed:', error);
    throw new Error('Failed to download update package (broken link or missing file).');
  }
};

export const triggerUpdateInstall = async (): Promise<void> => {
  updaterLogger.info('Triggering update installation via IPC...');
  if (!app.isPackaged) {
    updaterLogger.info('Dev mode: Cannot quit and install update in un-packaged development build.');
    return;
  }

  if (process.platform === 'darwin') {
    const macUpdater = autoUpdater as unknown as {
      squirrelDownloadedUpdate?: boolean;
      nativeUpdater?: {
        quitAndInstall?: () => void;
      };
    };

    if (macUpdater.squirrelDownloadedUpdate && macUpdater.nativeUpdater?.quitAndInstall) {
      updaterLogger.info('macOS: Squirrel.Mac update ready, invoking native quitAndInstall...');
      macUpdater.nativeUpdater.quitAndInstall();
      return;
    } else if (!macUpdater.squirrelDownloadedUpdate) {
      updaterLogger.warn('macOS: triggerUpdateInstall called but Squirrel.Mac has not finished unpacking update.');
      throw new Error('Update is still preparing or failed verification. Please check logs.');
    }
  }

  autoUpdater.quitAndInstall(false, true);
};
