import path from 'node:path';
import { execPromise } from './utils/exec';
import { getBinaryPath } from './utils/binaries';
import type { Bench, Site } from '../shared/domain/models';
import type { SiteCreateInput } from '../shared/ipc';
import { canAttachSiteToBench } from '../shared/domain/site-lifecycle';
import { getTaskRunner } from './task-runner';
import { getRuntimeEnv } from './runtime-service';

export type SiteCreationDependencies = {
  readonly benches: {
    findById: (id: string) => Promise<Bench | null>;
  };
  readonly sites: {
    create: (input: {
      name: string;
      benchId: string;
      groupId: string | null;
      apps: string[];
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path: string;
    }) => Promise<Site>;
    update: (id: string, input: {
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
    }) => Promise<Site | null>;
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
      try {
        context.startStep('init', 'Preparing site environment');
        // In frappe_docker, we run commands via compose
        const runtimeCmd = getBinaryPath('docker-compose');
        const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;
        
        context.startStep('new-site', `Running bench new-site ${input.name}`);
        
        // We assume the service name is 'backend' in frappe_docker
        const dbPassword = 'admin';
        const adminPassword = 'admin';
        
        const runtimeEnv = await getRuntimeEnv();
        const args = [
          '-p', projectName,
          'exec',
          'backend',
          'bench',
          'new-site',
          input.force ? '--force' : '',
          '--no-mariadb-socket',
          '--db-host', 'db',
          '--admin-password', adminPassword,
          '--db-root-password', dbPassword,
          '--install-app', 'frappe',
          ...input.apps.filter(app => app !== 'frappe').flatMap(app => ['--install-app', app]),
          input.name
        ].filter(Boolean);

        context.log('info', `Running: ${runtimeCmd} ${args.join(' ')}`, 'new-site');

        const { code, stderr } = await execPromise(
          runtimeCmd,
          args,
          bench.path,
          (out) => context.log('info', out, 'new-site'),
          runtimeEnv
        );

        if (code !== 0) {
          throw new Error(`Command failed with code ${code}: ${stderr}`);
        }
        
        context.completeStep('new-site', 'Site created successfully');
        await dependencies.sites.update(createdSite.id, { status: 'running' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('error', message, 'new-site');
        await dependencies.sites.update(createdSite.id, { status: 'failure' });
        throw error;
      }
    }
  });

  return createdSite;
};
export const orchestrateSiteDeletion = async (
  dependencies: {
    sites: {
      findById: (id: string) => Promise<Site | null>;
      delete: (id: string) => Promise<boolean>;
    };
    benches: {
      findById: (id: string) => Promise<Bench | null>;
    };
  },
  siteId: string
): Promise<boolean> => {
  const site = await dependencies.sites.findById(siteId);
  if (!site) return false;

  const bench = await dependencies.benches.findById(site.benchId);
  if (!bench) {
    return dependencies.sites.delete(siteId);
  }

  const taskRunner = getTaskRunner();
  taskRunner.enqueue({
    name: `Delete Site: ${site.name}`,
    resource: { type: 'site', id: siteId },
    run: async (context) => {
      try {
        context.startStep('drop-site', `Dropping site ${site.name}`);
        const runtimeCmd = getBinaryPath('docker-compose');
        const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;
        const runtimeEnv = await getRuntimeEnv();
        const dbPassword = 'admin';

        const args = [
          '-p', projectName,
          'exec',
          'backend',
          'bench',
          'drop-site',
          '--no-backup',
          '--root-password', dbPassword,
          '--force',
          site.name
        ];

        context.log('info', `Running: ${runtimeCmd} ${args.join(' ')}`, 'drop-site');

        const { code, stderr } = await execPromise(
          runtimeCmd,
          args,
          bench.path,
          (out) => context.log('info', out, 'drop-site'),
          runtimeEnv
        );

        if (code !== 0) {
          throw new Error(`Command failed with code ${code}: ${stderr}`);
        }

        context.completeStep('drop-site', 'Site dropped successfully');
        await dependencies.sites.delete(siteId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('error', message, 'drop-site');
        throw error;
      }
    }
  });

  return true;
};
