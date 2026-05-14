import path from 'node:path';
import fs from 'node:fs';
import { execPromise } from './utils/exec';
import { getBinaryPath } from './utils/binaries';
import type { Bench, Site } from '../shared/domain/models';
import type { SiteCreateInput } from '../shared/ipc';
import { canAttachSiteToBench } from '../shared/domain/site-lifecycle';
import { getTaskRunner } from './task-runner';
import { getRuntimeEnv } from './runtime-service';
import { addHostsEntry, removeHostsEntry } from './hosts-manager';
import { DATABASE_CREDENTIALS, DOCKER_SERVICES, OPERATION_TIMEOUTS } from './constants';
import { humanizeCreateFailure, isLikelyOutOfMemory } from '../shared/runtime-errors';

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



export const orchestrateSiteCreation = async (
  dependencies: SiteCreationDependencies,
  input: SiteCreateInput
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
      const projectName = `local-bench-${bench.id.slice(0, 8)}`;

      const cleanupFailedCreate = async () => {
        context.startStep('cleanup', 'Cleaning up partial site resources');
        const runtimeCmd = getBinaryPath('docker-compose');
        const runtimeEnv = await getRuntimeEnv();

        try {
          const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;
          const dropArgs = [
            '-p', projectName,
            'exec',
            '-T',
            'backend',
            'bench',
            'drop-site',
            '--no-backup',
            '--db-root-username', 'root',
            '--db-root-password', dbPassword,
            '--force',
            input.name,
          ];

          await execPromise(
            runtimeCmd,
            dropArgs,
            bench.path,
            (out) => context.log('info', out, 'cleanup'),
            runtimeEnv,
            OPERATION_TIMEOUTS.BENCH_CLEANUP
          );
        } catch (cleanupError) {
          context.log('warning', `Database cleanup skipped: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 'cleanup');
        }

        try {
          const siteFolderPath = path.join(bench.path, 'sites', input.name);
          if (fs.existsSync(siteFolderPath)) {
            fs.rmSync(siteFolderPath, { recursive: true, force: true });
          }
        } catch (cleanupError) {
          context.log('warning', `Filesystem cleanup skipped: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 'cleanup');
        }

        try {
          await removeHostsEntry(input.name);
        } catch (cleanupError) {
          context.log('warning', `Hosts cleanup skipped: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 'cleanup');
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
        const args = [
          '-p', projectName,
          'exec',
          '-T',
          'backend',
          'bench',
          'new-site',
          input.force ? '--force' : '',
          '--mariadb-user-host-login-scope', '%',
          '--db-host', 'db',
          '--admin-password', adminPassword,
          '--db-root-password', dbPassword,
          '--install-app', 'frappe',
          ...input.apps.filter(app => app !== 'frappe').flatMap(app => ['--install-app', app]),
          input.name
        ].filter(Boolean);

        context.log('info', `Running: ${runtimeCmd} ${args.join(' ')}`, 'new-site');

        const { code, stderr, stdout } = await execPromise(
          runtimeCmd,
          args,
          bench.path,
          (out) => context.log('info', out, 'new-site'),
          runtimeEnv,
          OPERATION_TIMEOUTS.SITE_CREATION
        );

        if (code !== 0) {
          const combinedOutput = `${stdout}\n${stderr}`;
          const failure = code === 137 || isLikelyOutOfMemory(combinedOutput)
            ? humanizeCreateFailure('site', `code ${code}: ${combinedOutput}`)
            : `Command failed with code ${code}: ${stderr}`;
          throw new Error(failure);
        }
        
        context.completeStep('new-site', 'Site created successfully');

        context.startStep('hosts', 'Configuring local domain');
        const hostsAdded = await addHostsEntry(input.name, bench.id);
        if (hostsAdded) {
          context.completeStep('hosts', `Mapped ${input.name} → 127.0.0.1`);
        } else {
          context.log('warning', `Could not add hosts entry for ${input.name}. You may need to add it manually to /etc/hosts.`, 'hosts');
        }

        await dependencies.sites.update(createdSite.id, { status: 'running' });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
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
        const projectName = `local-bench-${bench.id.slice(0, 8)}`;
        const runtimeEnv = await getRuntimeEnv();
        const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;

        const args = [
          '-p', projectName,
          'exec',
          '-T',
          'backend',
          'bench',
          'drop-site',
          '--no-backup',
          '--db-root-username', 'root',
          '--db-root-password', dbPassword,
          '--force',
          site.name
        ];

        context.log('info', `Running: ${runtimeCmd} ${args.join(' ')}`, 'drop-site');

        try {
          const { code, stderr } = await execPromise(
            runtimeCmd,
            args,
            bench.path,
            (out) => context.log('info', out, 'drop-site'),
            runtimeEnv,
            OPERATION_TIMEOUTS.BENCH_CLEANUP
          );

          if (code !== 0) {
            context.log('warning', `Command failed with code ${code}: ${stderr}`, 'drop-site');
          } else {
            context.completeStep('drop-site', 'Site dropped successfully');
          }
        } catch (execError) {
          const message = execError instanceof Error ? execError.message : String(execError);
          context.log('warning', `Failed to drop site database: ${message}`, 'drop-site');
        }

        context.startStep('rm-dir', `Removing site directory`);
        try {
          const siteFolderPath = path.join(bench.path, 'sites', site.name);
          if (fs.existsSync(siteFolderPath)) {
            fs.rmSync(siteFolderPath, { recursive: true, force: true });
          }
          context.completeStep('rm-dir', `Site directory removed`);
        } catch (fsError) {
          context.log('warning', `Failed to remove site directory: ${fsError instanceof Error ? fsError.message : String(fsError)}`, 'rm-dir');
        }

        context.startStep('hosts', 'Removing local domain mapping');
        const hostsRemoved = await removeHostsEntry(site.name);
        if (hostsRemoved) {
          context.completeStep('hosts', `Removed ${site.name} from /etc/hosts`);
        } else {
          context.log('warning', `Could not remove hosts entry for ${site.name}. You may need to remove it manually from /etc/hosts.`, 'hosts');
        }

        await dependencies.sites.delete(siteId);
        if (options?.onDeleted) {
          try {
            await options.onDeleted(site);
          } catch (error) {
            context.log('warning', `Post-delete site cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('error', message, 'drop-site');
        await dependencies.sites.update(siteId, { status: 'failure' });
        throw error;
      }
    }
  });

  return true;
};

const isBenignSchedulerState = (
  targetStatus: 'running' | 'stopped',
  stdout: string,
  stderr: string
): boolean => {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  if (targetStatus === 'running') {
    return combined.includes('scheduler') && combined.includes('already') && combined.includes('enable');
  }

  return combined.includes('scheduler') && combined.includes('already') && combined.includes('disable');
};

export const orchestrateSiteStatusUpdate = (
  dependencies: {
    benches: {
      findById: (id: string) => Promise<Bench | null>;
    };
    sites: {
      update: (id: string, input: { status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure' }) => Promise<Site | null>;
    };
  },
  site: Site,
  targetStatus: 'running' | 'stopped'
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: targetStatus === 'running' ? `Start Site: ${site.name}` : `Stop Site: ${site.name}`,
    resource: { type: 'site', id: site.id },
    run: async (context) => {
      try {
        context.startStep('orchestration', targetStatus === 'running' ? 'Starting site' : 'Stopping site');
        const bench = await dependencies.benches.findById(site.benchId);
        const benchCwd = bench?.path ?? '';
        
        // Execute docker-compose commands to actually start/stop the site
        const runtimeCmd = getBinaryPath('docker-compose');
        const projectName = `local-bench-${site.benchId.slice(0, 8)}`;
        const runtimeEnv = await getRuntimeEnv();
        
        // Control site availability via scheduler for the specific site.
        // `enable-site` / `disable-site` do not exist on bench.
        const siteCommand = targetStatus === 'running' ? 'enable-scheduler' : 'disable-scheduler';
        const args = [
          '-p', projectName,
          'exec',
          '-T',
          DOCKER_SERVICES.BACKEND,
          'bench',
          '--site',
          site.name,
          siteCommand,
        ];

        const runSchedulerCommand = async () => {
          return execPromise(
            runtimeCmd,
            args,
            benchCwd,
            (out) => context.log('info', out),
            runtimeEnv,
            OPERATION_TIMEOUTS.SITE_STATUS_UPDATE
          );
        };

        let result: Awaited<ReturnType<typeof runSchedulerCommand>> | null = null;
        const maxTimeoutRetries = 2;
        for (let attempt = 0; attempt <= maxTimeoutRetries; attempt += 1) {
          context.throwIfCancelled();
          try {
            result = await runSchedulerCommand();
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isTimeoutError = message.includes('Command timed out');
            if (!isTimeoutError || attempt === maxTimeoutRetries) {
              throw error;
            }

            context.log(
              'warning',
              `Scheduler command timed out (attempt ${attempt + 1}/${maxTimeoutRetries + 1}). Retrying: ${site.name}`
            );
          }
        }

        if (!result) {
          throw new Error(`Failed to update scheduler for ${site.name}: no result returned`);
        }

        const { code, stderr } = result;
        
        if (code !== 0 && !isBenignSchedulerState(targetStatus, result.stdout, stderr)) {
          throw new Error(`Failed to update scheduler for ${site.name}: ${stderr}`);
        }

        if (code !== 0) {
          context.log('warning', `Scheduler already in desired state for ${site.name}. Continuing.`);
        }
        
        context.completeStep('orchestration', targetStatus === 'running' ? 'Site started' : 'Site stopped');
        await dependencies.sites.update(site.id, { status: targetStatus });
      } catch (error) {
        context.log('error', `Failed to update site status: ${error instanceof Error ? error.message : String(error)}`);
        await dependencies.sites.update(site.id, { status: 'failure' });
        throw error;
      }
    }
  });
};
