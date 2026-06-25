import { app, dialog, BrowserWindow } from 'electron';
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

    if (!settings.autoUpdateEnabled) {
      updaterLogger.info('auto updates are disabled in settings');
      autoUpdater.autoDownload = false;
    } else {
      autoUpdater.autoDownload = true;
    }

    if (settings.updateChannel === 'stable') {
      autoUpdater.channel = 'latest';
      autoUpdater.allowPrerelease = false;
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'lubusIN',
        repo: 'frappe-local',
      });
    } else {
      autoUpdater.channel = settings.updateChannel;
      autoUpdater.allowPrerelease = true;

      if (settings.updateChannel === 'nightly') {
        autoUpdater.setFeedURL({
          provider: 'generic',
          url: 'https://github.com/lubusIN/frappe-local/releases/download/nightly',
          channel: 'nightly'
        });
      } else {
        autoUpdater.setFeedURL({
          provider: 'github',
          owner: 'lubusIN',
          repo: 'frappe-local',
        });
      }
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
  autoUpdater.on('update-available', (info) => {
    updaterLogger.info(`Update available: ${info.version}`);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(ipcChannels.updateAvailable, info.version);
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updaterLogger.info(`Update downloaded: ${info.version}`);
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
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    updaterLogger.error('Update download failed:', error);
    throw new Error('Failed to download update package (broken link or missing file).');
  }
};

export const triggerUpdateInstall = async (): Promise<void> => {
  updaterLogger.info('Triggering update installation via IPC...');
  autoUpdater.quitAndInstall();
};
