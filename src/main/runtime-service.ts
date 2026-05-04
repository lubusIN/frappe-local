import { execPromise } from './utils/exec';
import { createMainLogger } from './logger';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const logger = createMainLogger('runtime');

export async function ensureRuntimeRunning(): Promise<boolean> {
  return ensurePodmanRunning();
}

export async function getRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
  // Create an isolated Docker config directory so docker-compose does NOT read
  // ~/.docker/config.json (which may have "currentContext": "desktop-linux"
  // that forces connection to Docker Desktop's socket instead of our Podman socket).
  const isolatedConfigDir = path.join(os.tmpdir(), 'frappe-cafe-docker-config');
  try {
    if (!fs.existsSync(isolatedConfigDir)) {
      fs.mkdirSync(isolatedConfigDir, { recursive: true });
    }
    const configPath = path.join(isolatedConfigDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, '{}', 'utf8');
    }
  } catch (err) {
    logger.warn(`Failed to create isolated Docker config dir: ${err}`);
  }

  const env: NodeJS.ProcessEnv = {
    DOCKER_CONFIG: isolatedConfigDir,
  };
  
  if (process.platform === 'darwin' || process.platform === 'win32') {
    try {
      // Try machine inspect first (most reliable for machine-based podman)
      let { stdout } = await execPromise('podman', ['machine', 'inspect', '--format', '{{.ConnectionInfo.PodmanSocket.Path}}']);
      let socketPath = stdout.trim();
      
      // If that fails, try podman info (works if the machine is already the default context)
      if (!socketPath) {
        const infoResult = await execPromise('podman', ['info', '--format', '{{.Host.RemoteSocket.Path}}']);
        socketPath = infoResult.stdout.trim();
      }

      if (socketPath) {
        const prefix = process.platform === 'win32' ? 'npipe://' : 'unix://';
        env.DOCKER_HOST = socketPath.startsWith(prefix) ? socketPath : `${prefix}${socketPath}`;
        logger.info(`Detected podman socket at ${env.DOCKER_HOST}`);
      } else {
        logger.warn('Could not detect podman socket path');
      }
    } catch (err) {
      logger.warn(`Failed to detect podman socket: ${err}`);
    }
  }
  
  return env;
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


