import { execPromise } from './utils/exec';
import path from 'node:path';
import fs from 'node:fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { getTaskRunner } from './task-runner';
import type { Bench } from '../shared/domain/models';
import type { AppRuntimePaths } from './config';
import { ensureRuntimeRunning, getRuntimeEnv } from './runtime-service';

const copyRecursiveSync = (src: string, dest: string) => {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
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
  benchesRepo: { update: (id: string, payload: { status: 'queued' | 'running' | 'stopped' | 'success' | 'failure' }) => Promise<Bench | null> },
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
        const exampleEnvPath = path.join(bench.path, 'example.env');
        const targetEnvPath = path.join(bench.path, '.env');
        if (fs.existsSync(exampleEnvPath)) {
          let envContent = fs.readFileSync(exampleEnvPath, 'utf8');
          // Determine the branch/version to use
          const frappeVersion = bench.frappeVersion === 'develop' ? 'develop' : bench.frappeVersion;
          envContent = envContent.replace(/FRAPPE_VERSION=.*/g, `FRAPPE_VERSION=${frappeVersion}`);
          fs.writeFileSync(targetEnvPath, envContent);
          context.log('info', `Configured .env with FRAPPE_VERSION=${frappeVersion}`, 'env');
        }
        context.completeStep('env', 'Environment configured');

        context.startStep('start', 'Starting bench containers');
        const command = 'docker-compose';
        const args = ['up', '-d'];
        const runtimeEnv = await getRuntimeEnv();
        context.log('info', `[DEBUG] DOCKER_HOST=${runtimeEnv.DOCKER_HOST ?? 'NOT SET'}`, 'start');
        context.log('info', `[DEBUG] DOCKER_CONFIG=${runtimeEnv.DOCKER_CONFIG ?? 'NOT SET'}`, 'start');
        context.log('info', `[DEBUG] Running: ${command} ${args.join(' ')} in ${bench.path}`, 'start');
        const { code, stderr } = await execPromise(
          command,
          args,
          bench.path,
          (out) => context.log('info', out, 'start'),
          runtimeEnv
        );
        context.log('info', `[DEBUG] Exit code: ${code}, stderr: ${stderr}`, 'start');

        if (code !== 0) {
          throw new Error(`Command failed with code ${code}: ${stderr}`);
        }
        
        context.completeStep('start', 'Containers started successfully');

        await benchesRepo.update(bench.id, { status: 'running' });
      } catch (error) {
        await benchesRepo.update(bench.id, { status: 'failure' });
        throw error;
      }
    }
  });
};
