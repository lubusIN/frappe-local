import type { IpcMainLike, AppRepositories, IpcOperations } from '../ipc';

import type { SettingsItem } from '@frappe-local/shared/core';
import { fetchBreweryCatalog, syncAppCatalogFromBrewery } from '@frappe-local/main/services';

import { ipcChannels } from '@frappe-local/shared/core';

import { createMainLogger } from '@frappe-local/main/logger';


const mainLogger = createMainLogger('ipc');

import os from 'node:os';
import { nativeTheme } from 'electron';
import { DEFAULT_SETTINGS, MIN_PODMAN_MEMORY_MB, SettingsSchema, type Settings } from '@frappe-local/shared/domain';

import { configureUpdater } from '@frappe-local/main/updater';

const toSettingsItem = (settings: Settings): SettingsItem => ({
  defaultFrappeVersion: settings.defaultFrappeVersion,
  storagePath: settings.storagePath,
  editorPreference: settings.editorPreference,
  terminalPreference: settings.terminalPreference,
  updateChannel: settings.updateChannel,
  autoUpdateEnabled: settings.autoUpdateEnabled,
  sidebarCompact: settings.sidebarCompact,
  podmanMemoryMb: settings.podmanMemoryMb,
  shareSshKeys: settings.shareSshKeys,
  theme: settings.theme,
  breweryUrl: settings.breweryUrl,
});


const getCurrentSettings = async (repository: AppRepositories['settings']): Promise<Settings | null> => {
  if (repository.get) {
    return repository.get();
  }

  const settings = await repository.findAll?.();
  return settings?.[0] ?? null;
};

const updateSettings = async (
  repository: AppRepositories['settings'],
  input: Partial<Settings>
): Promise<Settings> => {
  if (repository.update) {
    return repository.update(input);
  }

  if (repository.set) {
    return repository.set(input);
  }

  throw new Error('Settings repository does not support updates.');
};

export const registerSettingsIpc = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations) => {
  ipcMainLike.handle(ipcChannels.settingsGet, async () => {
    const settings = await getCurrentSettings(repositories.settings);
    return settings ? toSettingsItem(settings) : null;
  });

  ipcMainLike.handle(ipcChannels.settingsSet, async (_event: unknown, input: unknown) => {
    const payload = SettingsSchema.partial().parse(input ?? {});
    const totalMemoryMb = Math.max(
      MIN_PODMAN_MEMORY_MB,
      Math.floor(os.totalmem() / (1024 * 1024))
    );
    if (payload.podmanMemoryMb && payload.podmanMemoryMb > totalMemoryMb) {
      throw new Error(`Podman memory cannot exceed system memory (${totalMemoryMb} MB).`);
    }
    const current = await getCurrentSettings(repositories.settings);
    if (
      payload.breweryUrl !== undefined &&
      payload.breweryUrl.trim() !== '' &&
      payload.breweryUrl.trim() !== current?.breweryUrl?.trim()
    ) {
      const validation = await fetchBreweryCatalog(payload.breweryUrl.trim());
      if (!validation.success) {
        throw new Error(
          `Cannot save settings: registry endpoint "${payload.breweryUrl.trim()}" is invalid or failed to fetch apps (${validation.error || 'Could not fetch app catalog from this URL.'})`
        );
      }
    }
    if (
      operations.applyRuntimeMemory &&
      payload.podmanMemoryMb !== undefined &&
      payload.podmanMemoryMb !== current?.podmanMemoryMb
    ) {
      await operations.applyRuntimeMemory(payload.podmanMemoryMb);
    }
    const fullPayload = {
      ...DEFAULT_SETTINGS,
      ...(current || {}),
      ...payload
    };
    const updated = await updateSettings(repositories.settings, fullPayload);
    
    nativeTheme.themeSource = updated.theme ?? 'system';
    
    // dynamically reconfigure updater in case update channel or autoUpdateEnabled changed
    configureUpdater(updated);
    
    if (
      payload.breweryUrl !== undefined &&
      payload.breweryUrl !== current?.breweryUrl &&
      repositories.appCatalog.sync
    ) {
      syncAppCatalogFromBrewery(updated.breweryUrl, { sync: repositories.appCatalog.sync }).catch((err) => {
        mainLogger.warn(`Background brewery catalog sync on settings change failed: ${err}`);
      });
    }
    
    return toSettingsItem(updated);
  });
};
