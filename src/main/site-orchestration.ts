import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Bench, Site } from '../shared/domain/models';
import type { SiteCreateInput } from '../shared/ipc';
import { canAttachSiteToBench } from '../shared/domain/site-lifecycle';
import { getTaskRunner } from './task-runner';

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

const execPromise = (command: string, args: string[], cwd: string, onOutput?: (data: string) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: true });
    child.stdout.on('data', (chunk: Buffer) => onOutput?.(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => onOutput?.(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
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
        await dependencies.sites.update(createdSite.id, { status: 'running' });
        
        context.startStep('init', 'Preparing site environment');
        // In frappe_docker, we run commands via compose
        const runtimeCmd = bench.runtime === 'podman' ? 'podman' : 'docker-compose';
        
        context.startStep('new-site', `Running bench new-site ${input.name}`);
        
        // We assume the service name is 'backend' in frappe_docker
        const dbPassword = 'admin';
        const adminPassword = 'admin';
        
        await execPromise(
          runtimeCmd,
          [
            bench.runtime === 'podman' ? 'compose' : '',
            'exec',
            'backend',
            'bench',
            'new-site',
            input.name,
            '--no-mariadb-socket',
            '--admin-password', adminPassword,
            '--db-root-password', dbPassword,
            '--install-app', 'frappe',
            ...input.apps.filter(app => app !== 'frappe').map(app => `--install-app ${app}`)
          ].filter(Boolean),
          bench.path,
          (out) => context.log('info', out, 'new-site')
        );
        
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
