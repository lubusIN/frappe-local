import { DEFAULT_HTTP_PORT, execPromise, getBinaryPath } from '@frappe-local/main/utils';
import { errorMessage } from '@frappe-local/shared/core';
import path from 'node:path';
import fs from 'node:fs';
import { getTaskRunner, type TaskExecutionContext } from '../task-runner';
import { ensureRuntimeRunning, getRuntimeEnv, getLastRuntimeError } from '../runtime-service';
import type { AppCatalogItem, Bench, CustomAppItem } from '@frappe-local/shared/domain';
import { IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS, QUICK_IDLE_TIMEOUT_MS, QUICK_MAX_TIMEOUT_MS, TASK_CANCELLABLE_AFTER_MS } from '@frappe-local/main/constants';
import { benchComposeArgs, composeBenchArgs, composeExecArgs, ensureBenchComposeWritten, getBenchComposePath, getComposeProjectName } from '@frappe-local/main/utils/podman';
import {
  resolveBenchBranch,
  resolveCatalogBranch,
  cleanupBenchAppArtifacts,
  updateContainerAppsTxt,
  ensureBenchProcfile,
  getLocalAppVolumes,
  getAppDelta,
  ensureBenchDevcontainer,
  ensureBenchSocketioPort
} from './utils';

export const fetchBenchApps = async (
  context: TaskExecutionContext,
  options: {
    stepId: string;
    stepStartDesc: string;
    stepCompleteDesc: string;
    apps: readonly string[];
    bench: Bench;
    appCatalogRepo?: { findById?: (id: string) => Promise<AppCatalogItem | null> };
    customAppsRepo?: { findAll?: () => Promise<CustomAppItem[]> };
    projectName: string;
    runtimeCmd: string;
    runtimeEnv: NodeJS.ProcessEnv;
    onAttemptedInstall: (app: string) => void;
  }
): Promise<string[]> => {
  if (options.apps.length === 0) return [];

  const { stepId, stepStartDesc, stepCompleteDesc, apps, bench, appCatalogRepo, customAppsRepo, projectName, runtimeCmd, runtimeEnv, onAttemptedInstall } = options;

  context.startStep(stepId, stepStartDesc);

  const appsTxtPath = path.join(bench.path, 'sites', 'apps.txt');
  const containerEnv = { projectName, runtimeCmd, runtimeEnv };
  if (process.platform === 'win32') {
    await updateContainerAppsTxt(bench.path, containerEnv, 'normalize').catch(() => undefined);
  } else if (fs.existsSync(appsTxtPath)) {
    try {
      const existing = fs.readFileSync(appsTxtPath, 'utf8');
      if (existing.length > 0 && !existing.endsWith('\n') && !existing.endsWith('\r')) {
        fs.writeFileSync(appsTxtPath, `${existing}\n`, 'utf8');
      }
    } catch {
      // ignore
    }
  }

  const benchBranch = resolveBenchBranch(bench.frappeVersion);

  const customAppsList = customAppsRepo?.findAll ? await customAppsRepo.findAll() : [];

  const allTargetApps = Array.from(new Set([...(bench.apps ?? []), ...apps]));
  const localVolumes = await getLocalAppVolumes(allTargetApps, customAppsRepo);
  if (localVolumes.length > 0) {
    context.log('info', 'Ensuring local custom app volumes are mounted into the bench container...', stepId);
    let shareSshKeys = true;
    try {
      const existingCompose = fs.readFileSync(getBenchComposePath(bench.path), 'utf8');
      shareSshKeys = existingCompose.includes('/.ssh:ro');
    } catch {
      // ignore
    }
    const composePath = ensureBenchComposeWritten(
      bench.path,
      bench.frappeVersion,
      bench.httpPort ?? DEFAULT_HTTP_PORT,
      shareSshKeys,
      localVolumes
    );
    const commonArgs = benchComposeArgs(projectName, composePath);
    const serviceResult = await execPromise(
      runtimeCmd,
      [...commonArgs, 'up', '-d', '--force-recreate', '--remove-orphans', 'frappe'],
      bench.path,
      (out) => context.log('info', out, stepId),
      runtimeEnv,
      { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
    );
    if (serviceResult.code !== 0) {
      throw new Error(`Could not update container mounts for local apps: ${serviceResult.stderr || serviceResult.stdout}`);
    }
    await ensureBenchDevcontainer(bench.path, context, stepId, undefined, bench.id);
  }

  for (const [index, app] of apps.entries()) {
    // Check if it's a custom app
    const customApp = customAppsList.find((candidate) => candidate.id === app || candidate.name === app);
    const appSlug = customApp ? customApp.name : app;
    onAttemptedInstall(appSlug);
    let getAppArgs: string[] = [];

    if (customApp) {
      if (customApp.type === 'local') {
        // For local apps, we don't fetch them using get-app with URL.
        // Instead, we just pip install -e /workspace/apps/${appSlug} or whatever path they are mapped to.
        // Wait, Frappe uses standard python paths. 
        // We will just tell bench to install it if it's not already installed.
        // Actually `bench get-app` clones it. If it's already mapped via docker-compose into `/workspace/apps/${appSlug}`, we just need to install it.
        context.log('info', `[${index + 1}/${apps.length}] Installing local app ${appSlug}`, stepId);
        // We use pip install -e and yarn install in the app folder
        const pipArgs = composeExecArgs(projectName, 'frappe', ['bench', 'pip', 'install', '-e', `apps/${appSlug}`]);
        const pipResult = await execPromise(runtimeCmd, pipArgs, bench.path, (out: string) => context.log('info', out, stepId), runtimeEnv, { idleTimeout: 5 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS });
        if (pipResult.code !== 0) throw new Error(`Failed to pip install local app ${appSlug}`);

        // Add to apps.txt reliably via Node filesystem BEFORE building
        try {
          if (process.platform === 'win32') {
            await updateContainerAppsTxt(bench.path, containerEnv, 'add', appSlug);
          } else {
            const existingApps = fs.existsSync(appsTxtPath) ? fs.readFileSync(appsTxtPath, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
            if (!existingApps.includes(appSlug)) {
              fs.writeFileSync(appsTxtPath, `${[...existingApps, appSlug].join('\n')}\n`, 'utf8');
            }
          }
        } catch {
          // ignore
        }

        // Try yarn install and build if package.json exists in root or frontend/ directory
        const yarnCmds = [
          `if [ -f apps/${appSlug}/package.json ]; then cd apps/${appSlug} && yarn install && (yarn build || true); fi`,
          `if [ -f apps/${appSlug}/frontend/package.json ]; then cd /workspace/apps/${appSlug}/frontend && yarn install && yarn build; fi`
        ].join(' && ');
        const yarnArgs = composeExecArgs(projectName, 'frappe', ['sh', '-c', yarnCmds]);
        await execPromise(runtimeCmd, yarnArgs, bench.path, (out: string) => context.log('info', out, stepId), runtimeEnv, { idleTimeout: 10 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS });

        // Build standard Frappe assets (public/js, public/css) for local app
        context.log('info', `Building standard assets for local app ${appSlug}...`, stepId);
        const buildArgs = composeBenchArgs(projectName, ['build', '--app', appSlug]);
        const buildRes = await execPromise(runtimeCmd, buildArgs, bench.path, (out: string) => context.log('info', out, stepId), runtimeEnv, { idleTimeout: 10 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS });
        if (buildRes.code !== 0) {
          context.log('warning', `Failed to build standard assets for local app ${appSlug}: ${buildRes.stderr}`, stepId);
        }
        continue;
      } else {
        // GitHub Custom App
        const appSource = customApp.source;
        const appBranch = customApp.branch || benchBranch;
        context.log('info', `[${index + 1}/${apps.length}] Fetching custom app ${appSlug} via bench get-app (${appBranch})`, stepId);
        getAppArgs = ['get-app', '--resolve-deps', '--overwrite', '--branch', appBranch, appSource];
      }
    } else {
      // Standard catalog app
      const catalogItem = appCatalogRepo?.findById ? await appCatalogRepo.findById(app) : null;
      const appSource = catalogItem?.source?.trim() || app;
      const appBranch = resolveCatalogBranch(catalogItem, bench.frappeVersion) ?? benchBranch;

      context.log('info', `[${index + 1}/${apps.length}] Fetching app ${app} via bench get-app (${appBranch})`, stepId);
      getAppArgs = ['get-app', '--resolve-deps', '--overwrite', '--branch', appBranch, appSource];
    }

    const args = composeBenchArgs(projectName, getAppArgs);
    let result;
    try {
      try {
        result = await execPromise(
          runtimeCmd,
          args,
          bench.path,
          (out: string) => context.log('info', out, stepId),
          runtimeEnv,
          { idleTimeout: 30 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS }
        );
      } catch (error) {
        if (!errorMessage(error).includes('Command timed out')) {
          throw error;
        }

        context.log('warning', `Fetching app ${app} timed out. Retrying once.`, stepId);
        result = await execPromise(
          runtimeCmd,
          args,
          bench.path,
          (out: string) => context.log('info', out, stepId),
          runtimeEnv,
          { idleTimeout: 30 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS }
        );
      }

      if (result.code !== 0) {
        throw new Error(`Failed to fetch app ${app}: ${result.stderr}`);
      }
    } catch (error) {
      context.log('warning', `Cleaning up failed installation of app: ${appSlug}`, stepId);
      try {
        if (process.platform === 'win32') {
          await cleanupBenchAppArtifacts(bench.path, [appSlug], context, stepId, containerEnv);
        } else {
          const appFolderPath = path.join(bench.path, 'apps', appSlug);
          if (fs.existsSync(appFolderPath)) {
            fs.rmSync(appFolderPath, { recursive: true, force: true });
          }

          if (fs.existsSync(appsTxtPath)) {
            let existingApps = fs.readFileSync(appsTxtPath, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            existingApps = existingApps.filter(a => a !== appSlug && !a.includes(appSlug) && !a.startsWith('http'));
            fs.writeFileSync(appsTxtPath, existingApps.length > 0 ? `${existingApps.join('\n')}\n` : '', 'utf8');
          }
        }
      } catch (cleanupErr) {
        context.log('warning', `Failed to clean up app ${appSlug}: ${cleanupErr}`, stepId);
      }
      throw error;
    }
  }

  context.completeStep(stepId, stepCompleteDesc);

  if (process.platform === 'win32') {
    return updateContainerAppsTxt(bench.path, containerEnv, 'normalize')
      .then((containerApps) => containerApps.length > 0 ? containerApps : allTargetApps)
      .catch(() => allTargetApps);
  }

  if (fs.existsSync(appsTxtPath)) {
    try {
      const existing = fs.readFileSync(appsTxtPath, 'utf8');
      return existing.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    } catch {
      // fallback
    }
  }

  // fallback if apps.txt read fails
  return allTargetApps;
};


/**
 * Main orchestration logic for creating a new Bench.
 * Handles configuration generation, docker-compose bringing up containers,
 * installing the selected apps, and updating the database state.
 */
export const orchestrateBenchAppChanges = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  appCatalogRepo: { findById?: (id: string) => Promise<AppCatalogItem | null> } | undefined,
  customAppsRepo: { findAll?: () => Promise<CustomAppItem[]> } | undefined,
  shareSshKeys: boolean = false,
  previousApps: readonly string[],
  nextApps: readonly string[]
): void => {
  const taskRunner = getTaskRunner();
  const delta = getAppDelta(previousApps, nextApps);

  if (delta.install.length === 0 && delta.remove.length === 0) {
    return;
  }

  const appName = delta.install[0] || delta.remove[0] || 'apps';
  const actionVerb = delta.install.length > 0 ? 'Get' : 'Remove';

  let attemptedInstallAppIds: string[] = [];
  let recoveryEnv: {
    command: string;
    projectName: string;
    runtimeEnv: NodeJS.ProcessEnv;
  } | null = null;

  const cleanupFailedBenchAppInstall = async (context: TaskExecutionContext) => {
    if (attemptedInstallAppIds.length > 0) {
      try {
        if (!context.signal.aborted) {
          context.startStep('rollback-apps', 'Restoring bench after failed app installation');
        }

        if (recoveryEnv) {
          for (const app of attemptedInstallAppIds) {
            const uninstallResult = await execPromise(
              recoveryEnv.command,
              composeBenchArgs(recoveryEnv.projectName, ['pip', 'uninstall', '-y', app]),
              bench.path,
              context.signal.aborted
                ? undefined
                : (out) => context.log('info', out, 'rollback-apps'),
              recoveryEnv.runtimeEnv,
              { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS, signal: null }
            );

            if (uninstallResult.code !== 0 && !context.signal.aborted) {
              context.log(
                'warning',
                `Could not uninstall partial Python package ${app}: ${uninstallResult.stderr || uninstallResult.stdout || `exit code ${uninstallResult.code}`
                }`,
                'rollback-apps'
              );
            }
          }
        }

        await cleanupBenchAppArtifacts(
          bench.path,
          attemptedInstallAppIds,
          context.signal.aborted ? { log: () => undefined } : context,
          'rollback-apps',
          recoveryEnv ? { projectName: recoveryEnv.projectName, runtimeCmd: recoveryEnv.command, runtimeEnv: recoveryEnv.runtimeEnv } : undefined
        );

        if (recoveryEnv) {
          const rebuildResult = await execPromise(
            recoveryEnv.command,
            composeBenchArgs(recoveryEnv.projectName, ['build']),
            bench.path,
            context.signal.aborted
              ? undefined
              : (out) => context.log('info', out, 'rollback-apps'),
            recoveryEnv.runtimeEnv,
            { idleTimeout: 30 * 60 * 1000, maxTimeout: MAX_WALL_CLOCK_MS, signal: null }
          );

          if (rebuildResult.code !== 0 && !context.signal.aborted) {
            context.log(
              'warning',
              `Could not rebuild remaining bench assets: ${rebuildResult.stderr || rebuildResult.stdout || `exit code ${rebuildResult.code}`
              }`,
              'rollback-apps'
            );
          }
        }

        if (!context.signal.aborted) {
          context.completeStep('rollback-apps', 'Bench restored after failed app installation');
        }
      } catch (cleanupError) {
        if (!context.signal.aborted) {
          context.log('error', `Failed to restore bench state: ${errorMessage(cleanupError)}`, 'rollback-apps');
        }
      }
    }

    // Explicitly revert the DB state to the existing apps to ensure the UI removes the failed app
    try {
      await benchesRepo.update(bench.id, { apps: [...previousApps] });
    } catch (dbCleanupError) {
      context.log('warning', `Failed to revert bench apps in DB: ${errorMessage(dbCleanupError)}`, 'apps');
    }
  };

  taskRunner.enqueue({
    name: `${actionVerb} app ${appName} on ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    cancellable: false,
    cancellableAfterMs: TASK_CANCELLABLE_AFTER_MS,
    onCancel: async (context) => {
      context.log('info', 'Cancelling app installation and cleaning up partial state...', 'rollback-apps');
      await cleanupFailedBenchAppInstall(context);
    },
    run: async (context) => {
      try {
        if (bench.status !== 'running') {
          throw new Error(`Bench ${bench.name} must be running before installed apps can be changed.`);
        }

        context.startStep('runtime', 'Checking podman status');
        const runtimeReady = await ensureRuntimeRunning((msg) => context.log('info', msg, 'runtime'));
        if (!runtimeReady) {
          throw new Error(
            getLastRuntimeError() ||
            'Podman is not running and could not be started automatically.'
          );
        }
        context.completeStep('runtime', 'Podman is ready');

        const command = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const localVolumes = await getLocalAppVolumes(nextApps, customAppsRepo);
        const composePath = ensureBenchComposeWritten(
          bench.path,
          bench.frappeVersion,
          bench.httpPort ?? DEFAULT_HTTP_PORT,
          shareSshKeys,
          localVolumes
        );
        const commonArgs = benchComposeArgs(projectName, composePath);
        const runtimeEnv = await getRuntimeEnv();

        context.startStep('bench-service', 'Ensuring bench containers are running');
        const serviceResult = await execPromise(
          command,
          [...commonArgs, 'up', '-d', '--force-recreate', '--remove-orphans', 'frappe'],
          bench.path,
          (out) => context.log('info', out, 'bench-service'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );
        if (serviceResult.code !== 0) {
          throw new Error(
            `Could not start bench containers for ${bench.name}: ${serviceResult.stderr || serviceResult.stdout}`
          );
        }
        context.completeStep('bench-service', 'Bench containers are running');
        recoveryEnv = { command, projectName, runtimeEnv };
        const containerEnv = { projectName, runtimeCmd: command, runtimeEnv };
        await ensureBenchSocketioPort(bench.path, bench.httpPort ?? DEFAULT_HTTP_PORT, context, 'bench-service', containerEnv);
        await ensureBenchProcfile(bench.path, context, 'bench-service', containerEnv);
        await ensureBenchDevcontainer(bench.path, context, 'bench-service', undefined, bench.id);

        // Temporarily pause background bench processes (watch, workers, web) to free up the 4GB VM memory
        // and avoid file lock collisions during yarn install and bench build.
        try {
          context.startStep('pause-bench', 'Pausing background processes to free memory');
          const pauseResult = await execPromise(
            command,
            composeExecArgs(projectName, 'frappe', ['pkill', '-f', 'honcho']),
            bench.path,
            (out) => context.log('info', out, 'pause-bench'),
            runtimeEnv,
            { idleTimeout: QUICK_IDLE_TIMEOUT_MS, maxTimeout: QUICK_MAX_TIMEOUT_MS }
          );

          if (pauseResult.code === 0) {
            context.completeStep('pause-bench', 'Background processes paused');
          } else {
            context.log(
              'warning',
              `Could not pause background processes: ${pauseResult.stderr || pauseResult.stdout}`,
              'pause-bench'
            );
            context.completeStep('pause-bench', 'Background processes were not running');
          }
        } catch (error) {
          context.log('warning', `Could not pause background processes: ${errorMessage(error)}`, 'pause-bench');
          context.completeStep('pause-bench', 'No background processes to pause');
        }

        if (delta.install.length > 0) {
          const fetchedApps = await fetchBenchApps(context, {
            stepId: 'install-apps',
            stepStartDesc: `Installing ${delta.install.length} app${delta.install.length === 1 ? '' : 's'}`,
            stepCompleteDesc: 'Selected apps installed',
            apps: delta.install,
            bench,
            appCatalogRepo,
            customAppsRepo,
            projectName,
            runtimeCmd: command,
            runtimeEnv,
            onAttemptedInstall: (app) => {
              attemptedInstallAppIds = [...attemptedInstallAppIds, app];
            }
          });
          delta.next = Array.from(new Set([...delta.next, ...fetchedApps]));
        }

        if (delta.remove.length > 0) {
          context.startStep('remove-apps', `Removing ${delta.remove.length} app${delta.remove.length === 1 ? '' : 's'}`);
          const customAppsList = customAppsRepo?.findAll ? await customAppsRepo.findAll() : [];
          const removedAppSlugs: string[] = [];

          for (const app of delta.remove) {
            const customApp = customAppsList.find((c) => c.id === app || c.name === app);
            const appSlug = customApp ? customApp.name : app;
            removedAppSlugs.push(appSlug);

            context.log('info', `Removing app ${appSlug} from bench`, 'remove-apps');
            const { code, stderr, stdout } = await execPromise(
              command,
              composeBenchArgs(projectName, ['remove-app', appSlug]),
              bench.path,
              (out) => context.log('info', out, 'remove-apps'),
              runtimeEnv, { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
            );

            if (code !== 0) {
              if (stderr.includes('AppNotInstalledError') || stdout?.includes('AppNotInstalledError') || stderr.includes('No app named') || stdout?.includes('No app named')) {
                context.log('info', `App ${appSlug} is already not installed.`, 'remove-apps');
              } else {
                throw new Error(`Failed to remove app ${appSlug}: ${stderr || stdout}`);
              }
            }
          }

          await cleanupBenchAppArtifacts(
            bench.path,
            removedAppSlugs,
            context,
            'remove-apps',
            recoveryEnv ? { projectName: recoveryEnv.projectName, runtimeCmd: recoveryEnv.command, runtimeEnv: recoveryEnv.runtimeEnv } : undefined
          );
          context.completeStep('remove-apps', 'Selected apps removed');
        }

        const persistedBench = await benchesRepo.update(bench.id, { apps: delta.next });
        if (!persistedBench) {
          throw new Error(`Failed to persist updated apps for bench ${bench.name}.`);
        }

        context.completeStep('apps', 'Bench apps updated');
      } catch (error) {
        await cleanupFailedBenchAppInstall(context);

        if (!context.signal.aborted) {
          context.log('error', errorMessage(error), 'apps');
        }
        throw error;
      } finally {
        if (recoveryEnv) {
          try {
            if (!context.signal.aborted) {
              context.startStep('resume-bench', 'Restarting background bench processes');
            }
            const restartResult = await execPromise(
              recoveryEnv.command,
              ['-p', recoveryEnv.projectName, 'exec', '-d', 'frappe', 'sh', '-c', 'nohup honcho start > logs/honcho.log 2>&1'],
              bench.path,
              context.signal.aborted
                ? undefined
                : (out) => context.log('info', out, 'resume-bench'),
              recoveryEnv.runtimeEnv,
              { idleTimeout: QUICK_IDLE_TIMEOUT_MS, maxTimeout: QUICK_MAX_TIMEOUT_MS, signal: null }
            );

            if (restartResult.code !== 0 && !context.signal.aborted) {
              context.log(
                'warning',
                `Failed to automatically restart bench processes: ${restartResult.stderr || restartResult.stdout || `exit code ${restartResult.code}`
                }`,
                'resume-bench'
              );
            } else if (!context.signal.aborted) {
              context.completeStep('resume-bench', 'Bench processes restarted');
            }
          } catch (recoveryError) {
            if (!context.signal.aborted) {
              context.log(
                'warning',
                `Failed to automatically restart bench processes: ${errorMessage(recoveryError)}`,
                'resume-bench'
              );
            }
          }
        }
      }
    }
  });
};
