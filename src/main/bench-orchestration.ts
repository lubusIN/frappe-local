import { execPromise } from './utils/exec';
import { getBinaryPath } from './utils/binaries';
import path from 'node:path';
import fs from 'node:fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { getTaskRunner } from './task-runner';
import type { Bench, Site } from '../shared/domain/models';
import type { AppRuntimePaths } from './config';
import { ensureRuntimeRunning, getRuntimeEnv } from './runtime-service';
import { removeAllHostsEntriesForBench } from './hosts-manager';
import { DATABASE_CREDENTIALS, DOCKER_SERVICES, OPERATION_TIMEOUTS } from './constants';
import { findNextAvailableTcpPort, isTcpPortFree } from './utils/ports';
import { humanizeCreateFailure, isLikelyOutOfMemory } from '../shared/runtime-errors';

const ensureBenchEnvConfigured = (benchPath: string, frappeVersion: string, httpPort?: number) => {
  const exampleEnvPath = path.join(benchPath, 'example.env');
  const targetEnvPath = path.join(benchPath, '.env');

  let envContent = '';
  if (fs.existsSync(targetEnvPath)) {
    envContent = fs.readFileSync(targetEnvPath, 'utf8');
  } else if (fs.existsSync(exampleEnvPath)) {
    envContent = fs.readFileSync(exampleEnvPath, 'utf8');
  } else {
    return; // No env to configure
  }

  const version = frappeVersion === 'develop' ? 'develop' : frappeVersion;

  // Set versions
  envContent = envContent.replace(/FRAPPE_VERSION=.*/g, `FRAPPE_VERSION=${version}`);
  envContent = envContent.replace(/ERPNEXT_VERSION=.*/g, `ERPNEXT_VERSION=${version}`);

  // Set default hosts for local setup
  envContent = envContent.replace(/DB_HOST=.*/g, `DB_HOST=db`);
  envContent = envContent.replace(/DB_PORT=.*/g, `DB_PORT=3306`);
  envContent = envContent.replace(/REDIS_CACHE=.*/g, `REDIS_CACHE=redis-cache:6379`);
  envContent = envContent.replace(/REDIS_QUEUE=.*/g, `REDIS_QUEUE=redis-queue:6379`);

  // Set HTTP Port
  if (httpPort) {
    if (envContent.includes('HTTP_PUBLISH_PORT=')) {
      envContent = envContent.replace(/HTTP_PUBLISH_PORT=.*/g, `HTTP_PUBLISH_PORT=${httpPort}`);
    } else {
      envContent += `\nHTTP_PUBLISH_PORT=${httpPort}\n`;
    }
  }

  fs.writeFileSync(targetEnvPath, envContent);
};

const DEFAULT_HTTP_PORT = 8080;

const resolveBenchHttpPort = async (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  allowPortShift: boolean
): Promise<Bench> => {
  const preferredPort = bench.httpPort ?? DEFAULT_HTTP_PORT;

  if (!allowPortShift) {
    return { ...bench, httpPort: preferredPort };
  }

  const isPreferredPortFree = await isTcpPortFree(preferredPort);
  if (isPreferredPortFree) {
    if (bench.httpPort !== preferredPort) {
      const updated = await benchesRepo.update(bench.id, { httpPort: preferredPort });
      return updated ?? { ...bench, httpPort: preferredPort };
    }
    return { ...bench, httpPort: preferredPort };
  }

  const nextPort = await findNextAvailableTcpPort(preferredPort + 1);
  context.log('warning', `HTTP port ${preferredPort} is busy. Reassigning ${bench.name} to ${nextPort}.`, 'env');

  const updated = await benchesRepo.update(bench.id, { httpPort: nextPort });
  return updated ?? { ...bench, httpPort: nextPort };
};

const copyRecursiveSync = (src: string, dest: string) => {
  const exists = fs.existsSync(src);
  if (!exists) {
    return;
  }

  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      if (childItemName === '.git') return; // Skip .git folder
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};



export const orchestrateBenchCreation = (
  bench: Bench,
  benchesRepo: {
    update: (id: string, payload: Partial<Bench>) => Promise<Bench | null>;
    delete?: (id: string) => Promise<boolean>;
  },
  runtimePaths: AppRuntimePaths
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Create Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      try {
        await benchesRepo.update(bench.id, { status: 'queued' });

        context.startStep('runtime', `Checking podman status`);
        const isRuntimeReady = await ensureRuntimeRunning();
        if (!isRuntimeReady) {
          throw new Error(`Podman is not running and could not be started automatically. Please start it manually.`);
        }
        context.completeStep('runtime', `Podman is ready`);

        const templatesDir = path.join(runtimePaths.userDataPath, 'templates');
        const frappeDockerTemplatePath = path.join(templatesDir, 'frappe_docker');

        context.startStep('template', 'Preparing frappe_docker template');
        
        if (!fs.existsSync(templatesDir)) {
          fs.mkdirSync(templatesDir, { recursive: true });
        }

        // Clone or update template
        if (!fs.existsSync(frappeDockerTemplatePath) || fs.readdirSync(frappeDockerTemplatePath).length === 0) {
          context.log('info', 'Cloning frappe_docker to local template cache...', 'template');
          await git.clone({
            fs,
            http,
            dir: frappeDockerTemplatePath,
            url: 'https://github.com/frappe/frappe_docker.git',
            singleBranch: true,
            depth: 1,
            onMessage: (msg) => context.log('info', msg, 'template')
          });
        } else {
          context.log('info', 'Updating local frappe_docker template...', 'template');
          try {
            await git.pull({
              fs,
              http,
              dir: frappeDockerTemplatePath,
              url: 'https://github.com/frappe/frappe_docker.git',
              singleBranch: true,
              fastForwardOnly: true,
              onMessage: (msg) => context.log('info', msg, 'template'),
              author: { name: 'Frappe Cafe', email: 'cafe@frappe.io' }
            });
            context.log('info', 'Template updated successfully', 'template');
          } catch (pullError) {
            context.log('warning', `Could not update template: ${pullError instanceof Error ? pullError.message : 'Network error'}. Using local version.`, 'template');
          }
        }
        context.completeStep('template', 'Template ready');

        context.startStep('clone', `Initializing bench at ${bench.path}`);
        if (!fs.existsSync(bench.path)) {
          fs.mkdirSync(bench.path, { recursive: true });
        }

        const files = fs.readdirSync(bench.path);
        if (files.length === 0) {
          context.log('info', 'Copying files from template...', 'clone');
          copyRecursiveSync(frappeDockerTemplatePath, bench.path);
        } else {
          context.log('info', 'Directory not empty, skipping initialization', 'clone');
        }

        context.completeStep('clone', 'Bench directory initialized');

        context.startStep('env', 'Setting up environment');
        const benchWithPort = await resolveBenchHttpPort(bench, benchesRepo, context, true);
        ensureBenchEnvConfigured(bench.path, bench.frappeVersion, benchWithPort.httpPort);
        context.completeStep('env', `Environment configured (HTTP port ${benchWithPort.httpPort})`);

        const command = getBinaryPath('docker-compose');
        const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;
        const commonArgs = [
          '-p', projectName,
          '-f', 'compose.yaml',
          '-f', 'overrides/compose.mariadb.yaml',
          '-f', 'overrides/compose.redis.yaml',
          '-f', 'overrides/compose.noproxy.yaml'
        ];
        const runtimeEnv = await getRuntimeEnv();

        context.startStep('pull', 'Pulling images');
        await execPromise(command, [...commonArgs, 'pull'], bench.path, (out) => context.log('info', out, 'pull'), runtimeEnv, 300000);
        context.completeStep('pull', 'Images pulled');

        context.startStep('start', 'Starting bench containers');
        const upArgs = [...commonArgs, 'up', '-d', '--remove-orphans'];
        const { code, stderr, stdout } = await execPromise(
          command,
          upArgs,
          bench.path,
          (out) => context.log('info', out, 'start'),
          runtimeEnv,
          300000
        );

        if (code !== 0) {
          const combinedOutput = `${stdout}\n${stderr}`;
          const failure = code === 137 || isLikelyOutOfMemory(combinedOutput)
            ? humanizeCreateFailure('bench', `code ${code}: ${combinedOutput}`)
            : `Command failed with code ${code}: ${stderr}`;
          throw new Error(failure);
        }
        
        context.completeStep('start', 'Containers started successfully');

        await benchesRepo.update(bench.id, { status: 'running' });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const message = humanizeCreateFailure('bench', rawMessage);
        context.log('error', message, 'start');

        if (isLikelyOutOfMemory(rawMessage)) {
          context.log(
            'warning',
            'Detected probable out-of-memory condition. Increase Podman machine memory and retry.',
            'start'
          );
        }

        try {
          context.startStep('cleanup', 'Cleaning up partial bench resources');
          const runtimeReady = await ensureRuntimeRunning();
          if (runtimeReady) {
            const runtimeEnv = await getRuntimeEnv();
            await execPromise(
              getBinaryPath('docker-compose'),
              ['-p', `frappe-cafe-${bench.id.slice(0, 8)}`, 'down', '-v', '--remove-orphans'],
              bench.path,
              (out) => context.log('info', out, 'cleanup'),
              runtimeEnv,
              OPERATION_TIMEOUTS.DOCKER_CLEANUP
            );
          } else {
            context.log('warning', 'Runtime unavailable. Skipping container cleanup after failed create.', 'cleanup');
          }
          context.completeStep('cleanup', 'Partial resources cleaned up');
        } catch (cleanupError) {
          context.log('warning', `Cleanup after failed create did not complete: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 'cleanup');
        }

        if (benchesRepo.delete) {
          await benchesRepo.delete(bench.id);
          context.log('warning', 'Removed failed bench record after create failure.', 'cleanup');
        } else {
          await benchesRepo.update(bench.id, { status: 'failure' });
        }

        throw new Error(message);
      }
    }
  });
};

export const orchestrateBenchStart = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  isRestart = false
): void => {
  const taskRunner = getTaskRunner();

  const CORE_BENCH_SERVICES = ['db', 'backend', 'frontend'] as const;

  const parseRunningServices = (stdout: string): Set<string> => {
    return new Set(
      stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  };

  const hasCoreBenchServicesRunning = (runningServices: Set<string>): boolean => {
    return CORE_BENCH_SERVICES.every((service) => runningServices.has(service));
  };

  taskRunner.enqueue({
    name: isRestart ? `Restart Bench ${bench.name}` : `Start Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      try {
        // Precondition checks
        context.startStep('validation', 'Validating bench configuration');
        
        if (!bench.path) {
          throw new Error(`Bench path is not configured for ${bench.name}`);
        }
        
        if (!fs.existsSync(bench.path)) {
          throw new Error(`Bench directory does not exist at ${bench.path}. Please check the path or delete and recreate the bench.`);
        }
        
        // Check for compose.yaml
        const composeYamlPath = path.join(bench.path, 'compose.yaml');
        if (!fs.existsSync(composeYamlPath)) {
          throw new Error(`Docker compose configuration not found at ${composeYamlPath}. Bench may be incomplete or corrupted.`);
        }
        
        // Check for required override files
        const requiredOverrides = [
          'overrides/compose.mariadb.yaml',
          'overrides/compose.redis.yaml',
          'overrides/compose.noproxy.yaml'
        ];
        
        for (const override of requiredOverrides) {
          const overridePath = path.join(bench.path, override);
          if (!fs.existsSync(overridePath)) {
            throw new Error(`Required override file not found at ${overridePath}. Bench may be incomplete.`);
          }
        }
        
        context.completeStep('validation', 'Bench configuration valid');
        
        context.log('info', `Orchestrating ${isRestart ? 'restart' : 'start'} for bench ${bench.name} (${bench.id})`);

        context.startStep('runtime', 'Checking podman status');
        const isRuntimeReady = await ensureRuntimeRunning();
        if (!isRuntimeReady) {
          throw new Error('Podman is not running and could not be started automatically.');
        }
        context.completeStep('runtime', 'Podman is ready');

        context.startStep('env', 'Configuring environment');
        const benchWithPort = await resolveBenchHttpPort(bench, benchesRepo, context, !isRestart);
        ensureBenchEnvConfigured(bench.path, bench.frappeVersion, benchWithPort.httpPort);
        context.completeStep('env', `Environment configured (HTTP port ${benchWithPort.httpPort})`);

        const command = getBinaryPath('docker-compose');
        const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;
        const commonArgs = [
          '-p', projectName,
          '-f', 'compose.yaml',
          '-f', 'overrides/compose.mariadb.yaml',
          '-f', 'overrides/compose.redis.yaml',
          '-f', 'overrides/compose.noproxy.yaml'
        ];
        const runtimeEnv = await getRuntimeEnv();

        if (!isRestart) {
          context.startStep('pull', 'Checking for image updates');
          await execPromise(command, [...commonArgs, 'pull'], bench.path, (out) => context.log('info', out, 'pull'), runtimeEnv, 300000);
          context.completeStep('pull', 'Images updated');
        }

        context.startStep('start', isRestart ? 'Restarting containers' : 'Starting containers');
        const upArgs = [
          ...commonArgs,
          'up', '-d',
          '--force-recreate',
          '--remove-orphans'
        ];
        
        context.log('info', `Running: ${command} ${upArgs.join(' ')}`);

        let upResult: Awaited<ReturnType<typeof execPromise>> | null = null;
        try {
          upResult = await execPromise(
            command,
            upArgs,
            bench.path,
            (out) => context.log('info', out, 'start'),
            runtimeEnv,
            OPERATION_TIMEOUTS.SITE_CREATION
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('Command timed out')) {
            throw error;
          }

          context.log(
            'warning',
            `${isRestart ? 'Restart' : 'Start'} timed out while waiting for compose output. Verifying running services...`,
            'start'
          );

          const psResult = await execPromise(
            command,
            [...commonArgs, 'ps', '--services', '--status', 'running'],
            bench.path,
            (out) => context.log('info', out, 'start'),
            runtimeEnv,
            OPERATION_TIMEOUTS.DEFAULT
          );

          const runningServices = parseRunningServices(psResult.stdout);
          if (hasCoreBenchServicesRunning(runningServices)) {
            context.log(
              'warning',
              'Compose timed out, but core services are running. Marking operation as successful.',
              'start'
            );
            context.log(
              'info',
              `${isRestart ? 'Restart' : 'Start'} finalized from running service health check fallback.`,
              'start'
            );
            upResult = { code: 0, stdout: psResult.stdout, stderr: psResult.stderr };
          } else {
            throw new Error(
              `${isRestart ? 'Restart' : 'Start'} timed out and core services did not come up. Running services: ${Array.from(runningServices).join(', ') || 'none'}`
            );
          }
        }

        if (upResult.code !== 0) {
          throw new Error(`Command failed with code ${upResult.code}: ${upResult.stderr}`);
        }
        
        context.completeStep('start', 'Containers are running');
        await benchesRepo.update(bench.id, { status: 'running' });
      } catch (error) {
        context.log('error', error instanceof Error ? error.message : String(error));
        await benchesRepo.update(bench.id, { status: 'failure' });
        throw error;
      }
    }
  });
};

export const orchestrateBenchStop = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> }
): void => {
  const taskRunner = getTaskRunner();

  const isBenignStopState = (stdout: string, stderr: string): boolean => {
    const combined = `${stdout}\n${stderr}`.toLowerCase();
    return (
      combined.includes('no containers to stop') ||
      combined.includes('is not running') ||
      combined.includes('no such container')
    );
  };

  taskRunner.enqueue({
    name: `Stop Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      try {
        await benchesRepo.update(bench.id, { status: 'queued' });

        context.startStep('stop', 'Stopping bench containers');
        const command = getBinaryPath('docker-compose');
        const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;
        const args = ['-p', projectName, 'stop', '--timeout', '20'];
        const runtimeEnv = await getRuntimeEnv();

        let result: Awaited<ReturnType<typeof execPromise>> | null = null;
        try {
          result = await execPromise(
            command,
            args,
            bench.path,
            (out) => context.log('info', out, 'stop'),
            runtimeEnv,
            OPERATION_TIMEOUTS.BENCH_STOP
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('Command timed out')) {
            throw error;
          }

          context.log('warning', `Bench stop timed out once. Falling back to docker-compose down: ${bench.name}`, 'stop');
          result = await execPromise(
            command,
            ['-p', projectName, 'down', '--remove-orphans', '--timeout', '20'],
            bench.path,
            (out) => context.log('info', out, 'stop'),
            runtimeEnv,
            OPERATION_TIMEOUTS.BENCH_STOP
          );
        }

        if (result.code !== 0 && !isBenignStopState(result.stdout, result.stderr)) {
          throw new Error(`Command failed: ${result.stderr}`);
        }

        if (result.code !== 0) {
          context.log('warning', `Bench ${bench.name} was already stopped. Continuing.`, 'stop');
        }
        
        context.completeStep('stop', 'Containers stopped successfully');
        await benchesRepo.update(bench.id, { status: 'stopped' });
      } catch (error) {
        await benchesRepo.update(bench.id, { status: 'failure' });
        throw error;
      }
    }
  });
};
export const orchestrateBenchCleaning = (
  bench: Bench,
  sitesRepo: { findAll: () => Promise<Site[]>, delete: (id: string) => Promise<boolean> }
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Clean Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      try {
        context.startStep('scan', 'Scanning for sites');
        
        // 1. Get sites from DB
        let allSites = await sitesRepo.findAll();
        const dbSites = allSites.filter(s => s.benchId === bench.id).map(s => s.name);
        
        // 2. Get sites from Disk
        let diskSites: string[] = [];
        const sitesPath = path.join(bench.path, 'sites');
        if (fs.existsSync(sitesPath)) {
          const entries = fs.readdirSync(sitesPath, { withFileTypes: true });
          diskSites = entries
            .filter((e) => e.isDirectory() && !['assets', 'languages'].includes(e.name))
            .map((e) => e.name);
        } else {
          context.log('info', 'Sites directory not found on disk, skipping disk scan');
        }

        // Unique set of sites to clean
        let sitesToClean = Array.from(new Set([...dbSites, ...diskSites]));

        context.log('info', `Found ${sitesToClean.length} total sites to clean (${dbSites.length} in DB, ${diskSites.length} on disk)`);
        context.completeStep('scan', `Found ${sitesToClean.length} sites`);

        // Re-verify bench state before proceeding with cleanup to avoid race conditions
        context.startStep('verify', 'Verifying bench consistency');
        const updatedSites = await sitesRepo.findAll();
        const reVerifyDbSites = updatedSites.filter(s => s.benchId === bench.id).map(s => s.name);
        
        // Check if new sites were added during scan
        const newSitesAdded = reVerifyDbSites.filter(s => !dbSites.includes(s));
        if (newSitesAdded.length > 0) {
          context.log('warning', `New sites detected during verification: ${newSitesAdded.join(', ')}. Adding to cleanup list.`);
          sitesToClean = Array.from(new Set([...sitesToClean, ...newSitesAdded]));
        }
        context.completeStep('verify', 'Bench consistency verified');

        const runtimeCmd = getBinaryPath('docker-compose');
        const runtimeEnv = await getRuntimeEnv();
        const dbPassword = DATABASE_CREDENTIALS.DB_PASSWORD;
        const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;

        // Refresh sites list for cleanup operations
        allSites = await sitesRepo.findAll();

        for (const siteName of sitesToClean) {
          context.startStep('drop', `Dropping site ${siteName}`);
          
          const args = [
            '-p', projectName,
            'exec',
            '-T',
            DOCKER_SERVICES.BACKEND,
            'bench',
            'drop-site',
            '--no-backup',
            '--db-root-username', DATABASE_CREDENTIALS.DB_ROOT_USERNAME,
            '--db-root-password', dbPassword,
            '--force',
            siteName
          ];

          try {
            // Only try to run bench command if the bench is running and site directory exists on disk
            // (or if we want to try anyway and ignore failure)
            const { code, stderr } = await execPromise(runtimeCmd, args, bench.path, (out) => context.log('info', out, 'drop'), runtimeEnv, OPERATION_TIMEOUTS.BENCH_CLEANUP);
            if (code !== 0) {
              context.log('warning', `Bench command failed for ${siteName} (it might not exist on disk): ${stderr}`);
            }
          } catch (err) {
            context.log('error', `Error dropping site ${siteName}: ${err instanceof Error ? err.message : String(err)}`);
          }

          // Cleanup from DB
          const registeredSite = allSites.find(s => s.name === siteName && s.benchId === bench.id);
          if (registeredSite) {
            await sitesRepo.delete(registeredSite.id);
            context.log('info', `Deleted site record: ${siteName}`);
          }
          
          context.completeStep('drop', `Finished cleaning ${siteName}`);
        }

        context.log('info', 'Bench cleaning completed successfully');
      } catch (error) {
        context.log('error', `Bench cleaning failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
  });
};

export const orchestrateBenchDeletion = (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null>, delete: (id: string) => Promise<boolean> },
  sitesRepo: { findAll: () => Promise<Site[]>, delete: (id: string) => Promise<boolean> }
): void => {
  const taskRunner = getTaskRunner();

  taskRunner.enqueue({
    name: `Delete Bench ${bench.name}`,
    resource: { type: 'bench', id: bench.id },
    run: async (context) => {
      try {
        // Set status to queued so the UI knows to poll for updates
        await benchesRepo.update(bench.id, { status: 'queued' });

        context.startStep('runtime', 'Checking podman status');
        const runtimeReady = await ensureRuntimeRunning();
        if (runtimeReady) {
          context.completeStep('runtime', 'Podman is ready');
        } else {
          context.log('warning', 'Podman is not running and could not be started automatically. Continuing with local force deletion.');
          context.completeStep('runtime', 'Podman unavailable; skipping container cleanup');
        }

        context.startStep('deleting', 'Deleting...');
        const command = getBinaryPath('docker-compose');
        const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;
        const args = ['-p', projectName, 'down', '-v', '--remove-orphans'];

        if (!runtimeReady) {
          context.completeStep('deleting', 'Docker cleanup skipped (runtime unavailable)');
        } else {
          let runtimeEnv = await getRuntimeEnv();
          const podmanCommand = getBinaryPath('podman');
          const listProjectResources = async (args: string[]): Promise<string[]> => {
            try {
              const { code, stdout } = await execPromise(
                podmanCommand,
                args,
                undefined,
                undefined,
                runtimeEnv,
                OPERATION_TIMEOUTS.DOCKER_CLEANUP
              );
              if (code !== 0) {
                return [];
              }

              return stdout
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
            } catch {
              return [];
            }
          };

          const cleanupProjectResources = async () => {
            const projectLabel = `label=com.docker.compose.project=${projectName}`;

            const containerIds = await listProjectResources([
              'ps',
              '-a',
              '--filter',
              projectLabel,
              '--format',
              '{{.ID}}',
            ]);
            if (containerIds.length > 0) {
              try {
                await execPromise(
                  podmanCommand,
                  ['rm', '-f', ...containerIds],
                  undefined,
                  undefined,
                  runtimeEnv,
                  OPERATION_TIMEOUTS.DOCKER_CLEANUP
                );
                context.log('info', `Removed ${containerIds.length} lingering containers for ${projectName}`, 'stop');
              } catch (error) {
                context.log('warning', `Failed to remove lingering containers for ${projectName}: ${error instanceof Error ? error.message : String(error)}`, 'stop');
              }
            }

            const volumeNames = await listProjectResources([
              'volume',
              'ls',
              '--filter',
              projectLabel,
              '--format',
              '{{.Name}}',
            ]);
            if (volumeNames.length > 0) {
              try {
                await execPromise(
                  podmanCommand,
                  ['volume', 'rm', '-f', ...volumeNames],
                  undefined,
                  undefined,
                  runtimeEnv,
                  OPERATION_TIMEOUTS.DOCKER_CLEANUP
                );
                context.log('info', `Removed ${volumeNames.length} lingering volumes for ${projectName}`, 'stop');
              } catch (error) {
                context.log('warning', `Failed to remove lingering volumes for ${projectName}: ${error instanceof Error ? error.message : String(error)}`, 'stop');
              }
            }

            const networkNames = await listProjectResources([
              'network',
              'ls',
              '--filter',
              projectLabel,
              '--format',
              '{{.Name}}',
            ]);
            if (networkNames.length > 0) {
              try {
                await execPromise(
                  podmanCommand,
                  ['network', 'rm', ...networkNames],
                  undefined,
                  undefined,
                  runtimeEnv,
                  OPERATION_TIMEOUTS.DOCKER_CLEANUP
                );
                context.log('info', `Removed ${networkNames.length} lingering networks for ${projectName}`, 'stop');
              } catch (error) {
                context.log('warning', `Failed to remove lingering networks for ${projectName}: ${error instanceof Error ? error.message : String(error)}`, 'stop');
              }
            }
          };

          try {
            const { code, stderr } = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'stop'), runtimeEnv, OPERATION_TIMEOUTS.DOCKER_CLEANUP);
            if (code !== 0) {
              throw new Error(`Docker cleanup failed with code ${code}: ${stderr}`);
            }
            await cleanupProjectResources();
            context.completeStep('deleting', 'Docker cleanup finished');
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const daemonUnavailable = message.includes('Cannot connect to the Docker daemon');

            if (daemonUnavailable) {
              context.log('warning', 'Docker daemon is unavailable. Attempting to start podman and retry cleanup once.');
              const runtimeRecovered = await ensureRuntimeRunning();
              if (runtimeRecovered) {
                runtimeEnv = await getRuntimeEnv();
                try {
                  const retryResult = await execPromise(command, args, bench.path, (out) => context.log('info', out, 'stop'), runtimeEnv, OPERATION_TIMEOUTS.DOCKER_CLEANUP);
                  if (retryResult.code === 0) {
                    await cleanupProjectResources();
                    context.completeStep('deleting', 'Docker cleanup finished after runtime recovery');
                  } else {
                    context.log('warning', `Docker cleanup retry failed with code ${retryResult.code}: ${retryResult.stderr}`);
                    context.completeStep('deleting', 'Docker cleanup skipped after retry failure');
                  }
                } catch (retryErr) {
                  context.log('warning', `Docker cleanup retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
                  context.completeStep('deleting', 'Docker cleanup skipped after retry failure');
                }
              } else {
                context.log('warning', 'Podman could not be started for cleanup retry. Continuing with local force deletion.');
                context.completeStep('deleting', 'Docker cleanup skipped (runtime unavailable)');
              }
            } else {
              context.log('warning', `Docker cleanup skipped: ${message}`);
              context.completeStep('deleting', 'Docker cleanup skipped');
            }
          }
        }

        context.startStep('db', 'Removing database records');
        
        // Remove sites
        const allSites = await sitesRepo.findAll();
        const attachedSites = allSites.filter(s => s.benchId === bench.id);
        for (const site of attachedSites) {
          context.log('info', `Deleting site record: ${site.name}`);
          await sitesRepo.delete(site.id);
        }

        // Remove bench
        await benchesRepo.delete(bench.id);
        context.completeStep('db', 'Database records removed');

        // Remove hosts entries for all sites in this bench
        context.startStep('hosts', 'Removing local domain mappings');
        try {
          await removeAllHostsEntriesForBench(bench.id, bench.name);
          context.completeStep('hosts', 'Domain mappings removed');
        } catch (hostsErr) {
          context.log('warning', `Could not remove hosts entries: ${hostsErr instanceof Error ? hostsErr.message : String(hostsErr)}`);
        }

        // Remove folder
        context.startStep('fs', 'Removing bench directory');
        try {
          if (fs.existsSync(bench.path)) {
            fs.rmSync(bench.path, { recursive: true, force: true });
          }
          context.completeStep('fs', 'Bench directory removed');
        } catch (fsErr) {
          context.log('warning', `Could not remove directory: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`);
          context.completeStep('fs', 'Bench directory removal skipped');
        }
      } catch (error) {
        context.log('error', `Force deletion failed: ${error instanceof Error ? error.message : String(error)}`);
        // If it fails, at least ensure it's not stuck in 'queued'
        await benchesRepo.update(bench.id, { status: 'failure' });
        throw error;
      }
    }
  });
};
