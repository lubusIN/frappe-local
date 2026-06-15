import path from 'node:path';
import fs from 'node:fs';
import { errorMessage } from '../../shared/core/utils';
import { execPromise } from '../utils/exec';
import { getBinaryPath } from '../utils/binaries';
import type { Bench, Site } from '../../shared/domain/models';
import type { SiteCreateInput } from '../../shared/core/ipc';
import { canAttachSiteToBench } from '../../shared/domain/site-lifecycle';
import { getTaskRunner, type TaskExecutionContext } from './task-runner';
import { getRuntimeEnv } from './runtime-service';
import { DATABASE_CREDENTIALS, IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS } from '../constants';
import { getComposeProjectName, composeBenchArgs, composeBenchSiteArgs } from '../utils/podman/compose-args';
import { humanizeCreateFailure, isLikelyOutOfMemory } from '../../shared/core/runtime-errors';

/** Shared execution context for running bench commands against a site. */
export type SiteCommandEnv = {
  projectName: string;
  benchPath: string;
  runtimeCmd: string;
  runtimeEnv: NodeJS.ProcessEnv;
};

const executeSiteCommand = async (
  context: TaskExecutionContext,
  options: {
    stepId: string;
    description: string;
    successMessage: string;
    commandName: string;
    siteName: string;
    env: SiteCommandEnv;
    timeout: { idleTimeout?: number; maxTimeout?: number };
  }
) => {
  context.startStep(options.stepId, options.description);
  const args = composeBenchSiteArgs(options.env.projectName, options.siteName, [options.commandName]);

  const result = await execPromise(
    options.env.runtimeCmd,
    args,
    options.env.benchPath,
    (out) => context.log('info', out, options.stepId),
    options.env.runtimeEnv,
    options.timeout
  );

  if (result.code !== 0) {
    throw new Error(`Failed to ${options.commandName} for site ${options.siteName}: ${result.stderr}`);
  }

  context.completeStep(options.stepId, options.successMessage);
};

const clearSiteCaches = async (
  context: TaskExecutionContext,
  siteName: string,
  env: SiteCommandEnv
) => {
  await executeSiteCommand(context, {
    stepId: 'cache',
    description: `Clearing cache for ${siteName}`,
    successMessage: 'Site cache cleared',
    commandName: 'clear-cache',
    siteName,
    env,
    timeout: { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  });

  await executeSiteCommand(context, {
    stepId: 'website-cache',
    description: `Clearing website cache for ${siteName}`,
    successMessage: 'Site website cache cleared',
    commandName: 'clear-website-cache',
    siteName,
    env,
    timeout: { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  });
};

const migrateSite = async (
  context: TaskExecutionContext,
  siteName: string,
  env: SiteCommandEnv
) => {
  await executeSiteCommand(context, {
    stepId: 'migrate',
    description: `Running migrate for ${siteName}`,
    successMessage: 'Site migration completed',
    commandName: 'migrate',
    siteName,
    env,
    timeout: { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  });
};

const restartBenchServices = async (
  context: TaskExecutionContext,
  env: SiteCommandEnv
) => {
  context.startStep('restart', 'Restarting bench processes');
  
  // Kill existing honcho/bench start process
  await execPromise(
    env.runtimeCmd,
    ['-p', env.projectName, 'exec', '-T', 'frappe', 'pkill', 'honcho'],
    env.benchPath,
    undefined,
    env.runtimeEnv,
    { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  ).catch(() => ({ code: 0 })); // Ignore error if it's not running

  // Start it again
  const restartResult = await execPromise(
    env.runtimeCmd,
    ['-p', env.projectName, 'exec', '-d', 'frappe', 'bench', 'start'],
    env.benchPath,
    (out) => context.log('info', out, 'restart'),
    env.runtimeEnv,
    { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  );

  if (restartResult.code !== 0) {
    throw new Error(`Failed to restart bench processes: ${restartResult.stderr}`);
  }

  await new Promise(resolve => setTimeout(resolve, 3000));
  context.completeStep('restart', 'Bench processes restarted');
};
export type SiteCreationDependencies = {
  readonly benches: {
    findById: (id: string) => Promise<Bench | null>;
  };
  readonly sites: {
    create: (input: {
      name: string;
      benchId: string;
      apps: string[];
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path: string;
    }) => Promise<Site>;
    update: (id: string, input: {
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
    }) => Promise<Site | null>;
    delete?: (id: string) => Promise<boolean>;
  };
};

/**
 * Orchestrates the creation of a new Frappe site within an existing bench.
 * Reuses the bench's credentials and runtime environment to run `bench new-site`.
 */
export const orchestrateSiteCreation = async (
  dependencies: SiteCreationDependencies,
  input: SiteCreateInput,
  options?: {
    onCompleted?: (site: Site) => Promise<void> | void;
  }
): Promise<Site> => {
  const bench = await dependencies.benches.findById(input.benchId);

  if (!bench) {
    throw new Error('Cannot create site: parent bench was not found.');
  }

  if (!canAttachSiteToBench(bench.status)) {
    throw new Error('Cannot create site: parent bench is not ready.');
  }

  const createdSite = await dependencies.sites.create({
    ...input,
    status: 'queued',
  });

  // Background orchestration
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Create Site: ${input.name}`,
    resource: { type: 'site', id: createdSite.id },
    run: async (context) => {
      const projectName = getComposeProjectName(bench.id);

      const cleanupFailedCreate = async () => {
        context.startStep('cleanup', 'Cleaning up partial site resources');
        const runtimeCmd = getBinaryPath('docker-compose');
        const runtimeEnv = await getRuntimeEnv();

        try {
          const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;
          const dropArgs = composeBenchArgs(projectName, [
            'drop-site',
            '--no-backup',
            '--db-root-username', 'root',
            '--db-root-password', dbPassword,
            '--force',
            input.name,
          ]);

          await execPromise(
            runtimeCmd,
            dropArgs,
            bench.path,
            (out) => context.log('info', out, 'cleanup'),
            runtimeEnv,
            { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS, signal: null }
          );
        } catch (cleanupError) {
          context.log('warning', `Database cleanup skipped: ${errorMessage(cleanupError)}`, 'cleanup');
        }

        try {
          const siteFolderPath = path.join(bench.path, 'sites', input.name);
          if (fs.existsSync(siteFolderPath)) {
            await fs.promises.rm(siteFolderPath, { recursive: true, force: true });
          }
        } catch (cleanupError) {
          context.log('warning', `Filesystem cleanup skipped: ${errorMessage(cleanupError)}`, 'cleanup');
        }

        context.completeStep('cleanup', 'Partial resources cleaned up');
      };

      try {
        context.startStep('init', 'Preparing site environment');
        // In frappe_docker, we run commands via compose
        const runtimeCmd = getBinaryPath('docker-compose');

        context.startStep('new-site', `Running bench new-site ${input.name}`);

        // We assume the service name is 'backend' in frappe_docker
        const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;
        const adminPassword = DATABASE_CREDENTIALS.ADMIN_PASSWORD;

        const runtimeEnv = await getRuntimeEnv();
        const args = composeBenchArgs(projectName, [
          'new-site',
          input.force ? '--force' : '',
          '--mariadb-user-host-login-scope', '%',
          '--db-host', 'mariadb',
          '--admin-password', adminPassword,
          '--db-root-password', dbPassword,
          '--install-app', 'frappe',
          ...input.apps.filter(app => app !== 'frappe').flatMap(app => ['--install-app', app]),
          input.name
        ].filter(Boolean));

        context.log('info', `Running: ${runtimeCmd} ${args.join(' ')}`, 'new-site');

        const { code, stderr, stdout } = await execPromise(
          runtimeCmd,
          args,
          bench.path,
          (out) => context.log('info', out, 'new-site'),
          runtimeEnv,
          { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
        );

        if (code !== 0) {
          const combinedOutput = `${stdout}\n${stderr}`;
          const failure = code === 137 || isLikelyOutOfMemory(combinedOutput)
            ? humanizeCreateFailure('site', `code ${code}: ${combinedOutput}`)
            : `Command failed with code ${code}: ${stderr}`;
          throw new Error(failure);
        }

        context.completeStep('new-site', 'Site created successfully');

        const siteEnv: SiteCommandEnv = { projectName, benchPath: bench.path, runtimeCmd, runtimeEnv };
        await migrateSite(context, input.name, siteEnv);
        await clearSiteCaches(context, input.name, siteEnv);
        await restartBenchServices(context, siteEnv);

        const updatedSite = await dependencies.sites.update(createdSite.id, { status: 'running' });
        
        if (options?.onCompleted && updatedSite) {
          try {
            await options.onCompleted(updatedSite);
          } catch (error) {
            context.log('warning', `Post-create site action failed: ${errorMessage(error)}`, 'new-site');
          }
        }
      } catch (error) {
        const rawMessage = errorMessage(error);
        const message = humanizeCreateFailure('site', rawMessage);
        context.log('error', message, 'new-site');

        if (isLikelyOutOfMemory(rawMessage)) {
          context.log(
            'warning',
            'Detected probable out-of-memory condition. Increase Podman machine memory and retry.',
            'new-site'
          );
        }

        await cleanupFailedCreate();

        if (dependencies.sites.delete) {
          await dependencies.sites.delete(createdSite.id);
        } else {
          await dependencies.sites.update(createdSite.id, { status: 'failure' });
        }

        throw new Error(message);
      }
    }
  });

  return createdSite;
};

/**
 * Orchestrates the deletion of a site.
 * Backs up (optional), drops the site database, removes the site folder,
 * and deletes the metadata from the database.
 */
export const orchestrateSiteDeletion = async (
  dependencies: {
    sites: {
      findById: (id: string) => Promise<Site | null>;
      update: (id: string, input: { status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure' }) => Promise<Site | null>;
      delete: (id: string) => Promise<boolean>;
    };
    benches: {
      findById: (id: string) => Promise<Bench | null>;
    };
  },
  siteId: string,
  options?: {
    onDeleted?: (site: Site) => Promise<void> | void;
  }
): Promise<boolean> => {
  const site = await dependencies.sites.findById(siteId);
  if (!site) return false;

  const bench = await dependencies.benches.findById(site.benchId);
  if (!bench) {
    return dependencies.sites.delete(siteId);
  }

  await dependencies.sites.update(siteId, { status: 'queued' });

  const taskRunner = getTaskRunner();
  taskRunner.enqueue({
    name: `Delete Site: ${site.name}`,
    resource: { type: 'site', id: siteId },
    run: async (context) => {
      try {
        context.startStep('drop-site', `Dropping site ${site.name}`);
        const runtimeCmd = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(bench.id);
        const runtimeEnv = await getRuntimeEnv();
        const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;

        const args = composeBenchArgs(projectName, [
          'drop-site',
          '--no-backup',
          '--db-root-username', 'root',
          '--db-root-password', dbPassword,
          '--force',
          site.name
        ]);

        context.log('info', `Running: ${runtimeCmd} ${args.join(' ')}`, 'drop-site');

        try {
          const { code, stderr } = await execPromise(
            runtimeCmd,
            args,
            bench.path,
            (out) => context.log('info', out, 'drop-site'),
            runtimeEnv,
            { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
          );

          if (code !== 0) {
            context.log('warning', `Command failed with code ${code}: ${stderr}`, 'drop-site');
          } else {
            context.completeStep('drop-site', 'Site dropped successfully');
          }
        } catch (execError) {
          const message = errorMessage(execError);
          context.log('warning', `Failed to drop site database: ${message}`, 'drop-site');
        }

        context.startStep('rm-dir', `Removing site directory`);
        try {
          const siteFolderPath = path.join(bench.path, 'sites', site.name);
          if (fs.existsSync(siteFolderPath)) {
            await fs.promises.rm(siteFolderPath, { recursive: true, force: true });
          }
          context.completeStep('rm-dir', `Site directory removed`);
        } catch (fsError) {
          context.log('warning', `Failed to remove site directory: ${errorMessage(fsError)}`, 'rm-dir');
        }

        await dependencies.sites.delete(siteId);
        if (options?.onDeleted) {
          try {
            await options.onDeleted(site);
          } catch (error) {
            context.log('warning', `Post-delete site cleanup failed: ${errorMessage(error)}`);
          }
        }
      } catch (error) {
        const message = errorMessage(error);
        context.log('error', message, 'drop-site');
        await dependencies.sites.update(siteId, { status: site.status });
        throw error;
      }
    }
  });

  return true;
};

/**
 * Modifies the installed apps for an existing site.
 * Computes the delta of apps to install and uninstall, then runs the
 * corresponding bench commands. Automatically migrates the site and clears
 * caches afterward.
 */
export const orchestrateSiteAppsUpdate = (
  dependencies: {
    benches: {
      findById: (id: string) => Promise<Bench | null>;
    };
    sites: {
      update: (id: string, input: { apps?: string[]; status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure' }) => Promise<Site | null>;
    };
  },
  site: Site,
  targetApps: readonly string[],
  options?: {
    onCompleted?: (site: Site) => Promise<void> | void;
  }
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Update Site Apps ${site.name}`,
    resource: { type: 'site', id: site.id },
    run: async (context) => {
      try {
        context.startStep('apps', 'Updating site apps');
        const bench = await dependencies.benches.findById(site.benchId);
        if (!bench) {
          throw new Error('Cannot update site apps: parent bench was not found.');
        }

        const installDelta = targetApps.filter((app) => !site.apps.includes(app));
        const uninstallDelta = site.apps.filter((app) => !targetApps.includes(app));
        const runtimeCmd = getBinaryPath('docker-compose');
        const projectName = getComposeProjectName(site.benchId);
        const runtimeEnv = await getRuntimeEnv();
        const siteEnv: SiteCommandEnv = { projectName, benchPath: bench.path, runtimeCmd, runtimeEnv };

        if (installDelta.length > 0) {
          context.startStep('install-apps', `Installing ${installDelta.length} app${installDelta.length === 1 ? '' : 's'} on ${site.name}`);

          for (const app of installDelta) {
            context.throwIfCancelled();
            context.log('info', `Installing app ${app} on ${site.name}`, 'install-apps');

            const args = composeBenchSiteArgs(projectName, site.name, ['install-app', app]);

            const { code, stderr } = await execPromise(
              runtimeCmd,
              args,
              bench.path,
              (out) => context.log('info', out, 'install-apps'),
              runtimeEnv,
              { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
            );

            if (code !== 0) {
              throw new Error(`Failed to install app ${app} on ${site.name}: ${stderr}`);
            }
          }

          context.completeStep('install-apps', 'App installation completed');

          await migrateSite(context, site.name, siteEnv);
        }

        if (uninstallDelta.length > 0) {
          context.startStep('uninstall-apps', `Uninstalling ${uninstallDelta.length} app${uninstallDelta.length === 1 ? '' : 's'} from ${site.name}`);

          for (const app of uninstallDelta) {
            context.throwIfCancelled();
            context.log('info', `Uninstalling app ${app} from ${site.name}`, 'uninstall-apps');

            // Proactively purge pending jobs to avoid QueueOverloaded errors in local dev environments
            const purgeArgs = composeBenchSiteArgs(projectName, site.name, ['purge-jobs']);

            try {
              context.log('info', `Purging pending background jobs for site ${site.name} to avoid queue overload`, 'uninstall-apps');
              await execPromise(
                runtimeCmd,
                purgeArgs,
                bench.path,
                (out) => context.log('info', out, 'uninstall-apps'),
                runtimeEnv,
                { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
              );
            } catch (err) {
              // Ignore failure of purge-jobs (e.g. if the command is not supported on older frappe versions)
              context.log('warning', `Failed to purge jobs: ${String(err)}`, 'uninstall-apps');
            }

            const args = composeBenchSiteArgs(projectName, site.name, ['uninstall-app', app, '--yes']);

            const { code, stderr } = await execPromise(
              runtimeCmd,
              args,
              bench.path,
              (out) => context.log('info', out, 'uninstall-apps'),
              runtimeEnv,
              { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
            );

            if (code !== 0) {
              throw new Error(`Failed to uninstall app ${app} from ${site.name}: ${stderr}`);
            }
          }

          context.completeStep('uninstall-apps', 'App uninstallation completed');

          await migrateSite(context, site.name, siteEnv);
        }

        await clearSiteCaches(context, site.name, siteEnv);

        if (installDelta.length > 0 || uninstallDelta.length > 0) {
          await restartBenchServices(context, siteEnv);
        }

        const updatedSite = await dependencies.sites.update(site.id, { apps: [...targetApps], status: 'running' });
        
        if (options?.onCompleted && updatedSite) {
          try {
            await options.onCompleted(updatedSite);
          } catch (error) {
            context.log('warning', `Post-update site action failed: ${errorMessage(error)}`, 'apps');
          }
        }
        
        context.completeStep('apps', 'Site apps updated');
      } catch (error) {
        context.log('error', `Failed to update site apps: ${errorMessage(error)}`, 'apps');
        await dependencies.sites.update(site.id, { status: site.status });
        throw error;
      }
    },
  });
};
