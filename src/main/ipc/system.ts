
import type { IpcMainLike, AppRepositories, IpcOperations, TaskRunnerLike } from '../ipc';

import type { AppHealthResponse, SystemResources, UpdateCheckResult } from '@frappe-local/shared/core';
import type { DiagnosticsReport } from '@frappe-local/shared/domain';
import { APP_CATALOG_SEED_VERSION, FRAPPE_LOCAL_MACHINE_NAME, ensureRuntimeRunning, getDefaultAppCatalogSeed, getLastDiagnosticsReport, getLastRuntimeError, getRuntimeEnv, resetAllBenchContainers, runDiagnostics } from '@frappe-local/main/services';

import { getPodmanMachines, isPodmanMachineRequired } from '@frappe-local/main/utils/podman';
import { getRecommendedPodmanMemoryMb, ipcChannels } from '@frappe-local/shared/core';
import { execPromise, getBinaryPath } from '@frappe-local/main/utils';

import { createMainLogger } from '@frappe-local/main/logger';


const mainLogger = createMainLogger('ipc');

import type { AppRuntimePaths } from '@frappe-local/main/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MIN_PODMAN_MEMORY_MB, type Settings } from '@frappe-local/shared/domain';

import { createDefaultStorageSnapshot } from '@frappe-local/main/storage';

import { triggerManualUpdateCheck, triggerUpdateDownload, triggerUpdateInstall } from '@frappe-local/main/updater';


const resolveUserPath = (untrimmedPath: string): string => {
  if (typeof untrimmedPath !== 'string') {
    return '';
  }
  const trimmedPath = untrimmedPath.trim();
  if (trimmedPath.startsWith('~')) {
    return path.join(os.homedir(), trimmedPath.slice(1));
  }

  return path.resolve(trimmedPath);
};









const getCurrentSettings = async (repository: AppRepositories['settings']): Promise<Settings | null> => {
  if (repository.get) {
    return repository.get();
  }

  const settings = await repository.findAll?.();
  return settings?.[0] ?? null;
};



import { BrowserWindow } from 'electron';

export const registerSystemIpc = (
  ipcMainLike: IpcMainLike,
  repositories: AppRepositories,
  operations: IpcOperations,
  taskRunner: TaskRunnerLike,
  appVersion: string,
  runtimePaths: AppRuntimePaths
) => {
  ipcMainLike.handle(ipcChannels.appHealthCheck, async (): Promise<AppHealthResponse> => {
    return {
      appName: 'Frappe Local',
      platform: process.platform,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      timestamp: new Date().toISOString(),
    };
  });

  ipcMainLike.handle(ipcChannels.runtimeFix, async (_event: unknown, checkType: unknown): Promise<boolean> => {
    if (typeof checkType !== 'string') return false;

    if (checkType === 'system-restart') {
      if (process.platform !== 'win32') return false;
      mainLogger.info('Triggering system restart...');
      await execPromise('shutdown', ['/r', '/t', '0']);
      return true;
    }

    if (checkType === 'wsl' || checkType === 'Windows Subsystem for Linux (WSL2)' || checkType === 'Windows Subsystem') {
      if (process.platform !== 'win32') return false;
      mainLogger.info('Triggering elevated WSL installation task...');
      if (!operations.installWslTask) return false;
      await taskRunner.enqueue({
        name: 'install-wsl',
        resource: { type: 'system', id: 'wsl' },
        run: async (ctx) => {
          await operations.installWslTask!(ctx);
        }
      });
      return true;
    }

    if (checkType !== 'runtime-health') return false;

    mainLogger.info('Attempting to fix runtime issues via unified service...');
    const fixed = await ensureRuntimeRunning();
    if (!fixed) {
      throw new Error(getLastRuntimeError() || 'Podman could not be initialized or started.');
    }
    return true;
  });

  ipcMainLike.handle(ipcChannels.frontDoorStatus, async () => {
    return {
      available: operations.isFrontDoorAvailable?.() ?? false,
      secure: operations.isFrontDoorSecure?.() ?? false,
    };
  });

  ipcMainLike.handle(ipcChannels.taskRunnerSubscribe, async () => {
    return true;
  });

  if (taskRunner && taskRunner.onEvent) {
    taskRunner.onEvent((event) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send(ipcChannels.taskRunnerProgressEvent, event);
        }
      });
    });
  }

  ipcMainLike.handle(ipcChannels.taskRunnerUnsubscribe, async () => {
    return true;
  });

  ipcMainLike.handle(ipcChannels.taskRunnerCancelTask, async (_event: unknown, taskId: unknown): Promise<boolean> => {
    if (typeof taskId !== 'string' || !taskId) return false;
    return taskRunner.cancelTask ? taskRunner.cancelTask(taskId) : false;
  });

  ipcMainLike.handle(ipcChannels.taskRunnerReadLog, async (_event: unknown, taskId: unknown): Promise<string> => {
    if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(taskId)) {
      throw new Error('Invalid task id.');
    }

    if (!runtimePaths.logsPath) {
      return '';
    }

    const logPath = path.join(runtimePaths.logsPath, 'tasks', `${taskId}.log`);
    try {
      return await fs.promises.readFile(logPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  });

  ipcMainLike.handle(ipcChannels.utilsCheckGithubRepoVisibility, async (_event: unknown, url: unknown): Promise<boolean> => {
    if (typeof url !== 'string' || !url) return false;
    try {
      // Basic extraction of owner/repo from various formats:
      let checkUrl = url;
      if (url.startsWith('https://github.com/')) {
        checkUrl = url.replace(/\.git$/, '');
      } else if (url.startsWith('git@github.com:')) {
        checkUrl = `https://github.com/${url.substring(15).replace(/\.git$/, '')}`;
      } else {
        return false;
      }
      
      const response = await fetch(checkUrl, { method: 'HEAD' });
      // GitHub returns 200 for public repos, 404/401 for private or non-existent
      return response.status === 200;
    } catch {
      return false;
    }
  });

  ipcMainLike.handle(ipcChannels.diagnosticsRun, async (): Promise<DiagnosticsReport> => {
    const report = await runDiagnostics({
      runtimePaths,
      settingsRepository: {
        get: async () => getCurrentSettings(repositories.settings),
      },
      appVersion,
    });

    if (report.hasCriticalIssues) {
      // Intentionally do not reset bench status to 'stopped'.
      // With 'restart: unless-stopped', benches retain their state across VM reboots.
    }

    return report;
  });

  ipcMainLike.handle(ipcChannels.diagnosticsGetLast, async (): Promise<DiagnosticsReport | null> => {
    return getLastDiagnosticsReport();
  });

  ipcMainLike.handle(ipcChannels.diagnosticsResetDevState, async (): Promise<boolean> => {
    BrowserWindow.getAllWindows()[0]?.webContents.send(ipcChannels.appLifecycleState, {
      state: 'resetting'
    });
    mainLogger.info('RESET initiated. Evaluating system state...');
    const benches = await repositories.benches.findAll();
    let podmanMachineRemovalError: Error | null = null;

    let hasPodmanMachine = false;
    if (isPodmanMachineRequired()) {
      try {
        const machines = await getPodmanMachines();
        hasPodmanMachine = machines.some((m) => m.Name === FRAPPE_LOCAL_MACHINE_NAME);
      } catch (error) {
        mainLogger.warn(`Failed to inspect Podman machine status during reset evaluation: ${error}`);
      }
    }

    // On native Linux (!isPodmanMachineRequired()), Podman runs directly on the host OS,
    // so we must explicitly tear down containers and volumes.
    // On Mac/Windows (isPodmanMachineRequired()), all containers live inside the dedicated VM;
    // destroying the VM obliterates all containers and volumes instantly.
    const shouldCleanContainers = !isPodmanMachineRequired();

    if (shouldCleanContainers) {
      let runtimeEnv: NodeJS.ProcessEnv | undefined;
      try {
        const runtimeReady = await ensureRuntimeRunning();
        if (runtimeReady) {
          runtimeEnv = await getRuntimeEnv();
        }
      } catch (error) {
        mainLogger.warn(`Runtime not available during reset operation: ${error}`);
      }

      if (runtimeEnv) {
        mainLogger.info('RESET Cleaning: Resetting bench containers and orphaned podman resources...');
        await resetAllBenchContainers(benches, runtimeEnv, mainLogger);
      }
    } else {
      mainLogger.info(`RESET Evaluation: Skipping container teardown (on VM platforms, destroying VM '${FRAPPE_LOCAL_MACHINE_NAME}' wipes all containers).`);
    }

    // Remove all bench folders and their sites from the filesystem
    if (benches.length > 0) {
      mainLogger.info(`RESET Cleaning: Evaluating ${benches.length} recorded bench folder(s) for removal...`);
      for (const bench of benches) {
        try {
          if (fs.existsSync(bench.path)) {
            await fs.promises.rm(bench.path, { recursive: true, force: true });
            mainLogger.info(`Removed bench folder: ${bench.path}`);
          } else {
            mainLogger.info(`RESET Evaluation: Bench folder already skipped (not found on disk): ${bench.path}`);
          }
        } catch (error) {
          mainLogger.warn(`Failed to remove bench folder ${bench.path}: ${error}`);
        }
      }
    } else {
      mainLogger.info('RESET Evaluation: Skipping recorded bench folders removal (no benches in database).');
    }

    const settings = await getCurrentSettings(repositories.settings);
    const managedBenchesDirectories = new Set([
      path.join(runtimePaths.userDataPath, 'benches'),
      ...(settings?.storagePath
        ? [path.join(resolveUserPath(settings.storagePath), 'benches')]
        : []),
    ]);

    for (const benchesDir of managedBenchesDirectories) {
      try {
        if (fs.existsSync(benchesDir)) {
          await fs.promises.rm(benchesDir, { recursive: true, force: true });
          mainLogger.info(`Removed dormant benches folder: ${benchesDir}`);
        } else {
          mainLogger.info(`RESET Evaluation: Dormant benches folder already skipped (not found): ${benchesDir}`);
        }
      } catch (error) {
        mainLogger.warn(`Failed to remove benches folder ${benchesDir}: ${error}`);
      }
    }

    if (isPodmanMachineRequired()) {
      if (hasPodmanMachine) {
        try {
          mainLogger.info(`Destroying dedicated podman machine: ${FRAPPE_LOCAL_MACHINE_NAME}`);
          const result = await execPromise(
            getBinaryPath('podman'),
            ['machine', 'rm', '--force', FRAPPE_LOCAL_MACHINE_NAME]
          );
          if (result.code !== 0) {
            const reason = (result.stderr || result.stdout).trim() || `exit code ${result.code}`;
            throw new Error(reason);
          }
          mainLogger.info(`Successfully destroyed podman machine: ${FRAPPE_LOCAL_MACHINE_NAME}`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          podmanMachineRemovalError = new Error(
            `Failed to destroy Podman machine '${FRAPPE_LOCAL_MACHINE_NAME}': ${reason}`
          );
          mainLogger.warn(podmanMachineRemovalError.message);
        }
      } else {
        mainLogger.info(`RESET Evaluation: Skipping podman machine destruction (machine '${FRAPPE_LOCAL_MACHINE_NAME}' does not exist).`);
      }
    }

    await fs.promises.rm(runtimePaths.storagePath, { recursive: true, force: true });
    await fs.promises.rm(runtimePaths.configPath, { recursive: true, force: true });
    await fs.promises.mkdir(runtimePaths.storagePath, { recursive: true });

    const snapshot = createDefaultStorageSnapshot(getDefaultAppCatalogSeed(), APP_CATALOG_SEED_VERSION);
    const storageFilePath = path.join(runtimePaths.storagePath, 'storage.json');
    fs.writeFileSync(storageFilePath, JSON.stringify(snapshot, null, 2), 'utf8');

    try {
      await operations.refreshFrontDoorHosts?.();
    } catch (error) {
      mainLogger.warn(`Failed to refresh front door hosts after reset: ${error}`);
    }

    if (podmanMachineRemovalError) {
      throw podmanMachineRemovalError;
    }

    mainLogger.info('RESET completed successfully.');
    return true;
  });

  ipcMainLike.handle(ipcChannels.systemResourcesGet, (): SystemResources => {
    const totalMemoryMb = Math.max(
      MIN_PODMAN_MEMORY_MB,
      Math.floor(os.totalmem() / (1024 * 1024))
    );
    return {
      totalMemoryMb,
      recommendedPodmanMemoryMb: getRecommendedPodmanMemoryMb(totalMemoryMb),
      podmanMachineRequired: isPodmanMachineRequired(),
    };
  });

  ipcMainLike.handle(ipcChannels.utilsPathExists, async (_event: unknown, targetPath: unknown) => {
    if (typeof targetPath !== 'string') {
      return false;
    }
    return operations.pathExists(resolveUserPath(targetPath));
  });

  ipcMainLike.handle(ipcChannels.utilsOpenExternal, async (_event: unknown, url: unknown) => {
    if (typeof url !== 'string') {
      return false;
    }
    return operations.openExternal(url);
  });

  ipcMainLike.handle(ipcChannels.utilsGetAvailableTerminals, async () => {
    const { detectAvailableTerminals } = await import('@frappe-local/main/utils');
    return await detectAvailableTerminals();
  });

  ipcMainLike.handle(ipcChannels.utilsCheckEditorInstalled, async (_event: unknown, commandName: unknown) => {
    const { isEditorInstalled } = await import('@frappe-local/main/utils');
    const cmd = typeof commandName === 'string' ? commandName : 'code';
    return isEditorInstalled(cmd);
  });

  ipcMainLike.handle(ipcChannels.updateCheckNow, async (): Promise<UpdateCheckResult> => {
    return await triggerManualUpdateCheck();
  });

  ipcMainLike.handle(ipcChannels.updateDownload, async (): Promise<void> => {
    return await triggerUpdateDownload();
  });

  ipcMainLike.handle(ipcChannels.updateInstall, async (): Promise<void> => {
    return await triggerUpdateInstall();
  });
};
