import { autoUpdater } from 'electron-updater';
import type { UpdateCheckResult } from '../shared/core/ipc';
import { createMainLogger } from './logger';
import type { SettingsRepository } from './storage/repositories/settings-repository';

const updaterLogger = createMainLogger('updater');

export const initializeUpdater = async (settingsRepository: SettingsRepository): Promise<void> => {
  autoUpdater.logger = {
    info: (message: string) => updaterLogger.info(message),
    warn: (message: string) => updaterLogger.warn(message),
    error: (message: string) => updaterLogger.error(message),
    debug: (message: string) => updaterLogger.debug(message),
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  try {
    const settings = await settingsRepository.get();
    
    if (!settings || !settings.autoUpdateEnabled) {
      updaterLogger.info('auto updates are disabled in settings');
      return;
    }

    if (settings.updateChannel === 'stable') {
      autoUpdater.channel = 'latest';
      autoUpdater.allowPrerelease = false;
    } else {
      autoUpdater.channel = settings.updateChannel;
      autoUpdater.allowPrerelease = true;
    }

    updaterLogger.info(`initializing updater on channel: ${autoUpdater.channel}`);
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    updaterLogger.error('failed to initialize auto updater', error);
  }
};

export const triggerManualUpdateCheck = async (): Promise<UpdateCheckResult> => {
  try {
    const result = await autoUpdater.checkForUpdates();
    const isAvailable = result && result.updateInfo && result.updateInfo.version !== autoUpdater.currentVersion.version;
    return {
      checkedAt: new Date().toISOString(),
      source: 'manual',
      status: isAvailable ? 'update-available' : 'up-to-date',
      message: isAvailable ? `Update available: ${result.updateInfo.version}` : 'You are on the latest version.',
    };
  } catch (error) {
    updaterLogger.error('manual update check failed', error);
    return {
      checkedAt: new Date().toISOString(),
      source: 'manual',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred.',
    };
  }
};
