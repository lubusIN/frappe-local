import { execPromise } from './utils/exec';
import { createMainLogger } from './logger';
import fs from 'node:fs';
import os from 'node:os';

const logger = createMainLogger('runtime');

export async function ensureRuntimeRunning(runtime: 'docker' | 'podman'): Promise<boolean> {
  if (runtime === 'podman') {
    return ensurePodmanRunning();
  }
  return ensureDockerRunning();
}

async function ensurePodmanRunning(): Promise<boolean> {
  try {
    // 1. Check if podman binary is available
    await execPromise('podman', ['--version']);
  } catch {
    logger.error('Podman binary not found');
    return false;
  }

  // 2. On Mac/Windows, check machine status
  if (process.platform === 'darwin' || process.platform === 'win32') {
    try {
      const { stdout } = await execPromise('podman', ['machine', 'ls', '--format', 'json']);
      const machines = JSON.parse(stdout || '[]');
      
      if (machines.length === 0) {
        logger.info('No podman machine found, initializing default...');
        await execPromise('podman', ['machine', 'init']);
      }

      // Check if any machine is running
      const { stdout: statusOutput } = await execPromise('podman', ['machine', 'ls', '--format', 'json']);
      const refreshedMachines = JSON.parse(statusOutput || '[]');
      const running = refreshedMachines.some((m: any) => m.Running || m.LastUp); 
      
      // Wait, 'Running' is the key. Let's be precise.
      const isActuallyRunning = refreshedMachines.some((m: any) => m.Running === true);

      if (!isActuallyRunning) {
        logger.info('Starting podman machine...');
        const { code } = await execPromise('podman', ['machine', 'start']);
        if (code !== 0) {
          logger.error('Failed to start podman machine');
          return false;
        }
      }
      return true;
    } catch (err) {
      logger.error(`Failed to ensure podman machine: ${err}`);
      return false;
    }
  }

  return true;
}

async function ensureDockerRunning(): Promise<boolean> {
  try {
    const { code } = await execPromise('docker', ['info']);
    if (code === 0) return true;

    logger.info('Docker not responding, attempting to start Docker Desktop...');
    if (process.platform === 'darwin') {
      try {
        await execPromise('open', ['-g', '-a', 'Docker']);
      } catch (err) {
        logger.error('Failed to open Docker app');
      }
    } else if (process.platform === 'win32') {
      const dockerPath = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
      if (fs.existsSync(dockerPath)) {
        try {
          await execPromise(`"${dockerPath}"`, []);
        } catch (err) {
          logger.error('Failed to start Docker Desktop on Windows');
        }
      }
    }
    
    // Wait for Docker to start (poll for up to 30s)
    for (let i = 0; i < 15; i++) {
      logger.info(`Waiting for Docker to initialize... (${i+1}/15)`);
      await new Promise(r => setTimeout(r, 2000));
      const { code: checkCode } = await execPromise('docker', ['info']);
      if (checkCode === 0) {
        logger.info('Docker is now running');
        return true;
      }
    }
    
    return false;
  } catch (err) {
    logger.error(`Failed to ensure docker: ${err}`);
    return false;
  }
}
