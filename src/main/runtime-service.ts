import { execPromise } from './utils/exec';
import { getBinaryPath } from './utils/binaries';
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
      const { stdout } = await execPromise(getBinaryPath('podman'), ['machine', 'inspect', '--format', '{{.ConnectionInfo.PodmanSocket.Path}}']);
      let socketPath = stdout.trim();
      
      // If that fails, try podman info (works if the machine is already the default context)
      if (!socketPath) {
        const infoResult = await execPromise(getBinaryPath('podman'), ['info', '--format', '{{.Host.RemoteSocket.Path}}']);
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

// Mutex to ensure only one machine operation happens at a time
let machineOperationLock = Promise.resolve();

async function ensurePodmanRunning(): Promise<boolean> {
  const previousLock = machineOperationLock;
  let release: () => void;
  machineOperationLock = new Promise((resolve) => {
    release = resolve;
  });

  await previousLock;

  try {
    logger.info('Acquired machine operation lock');
    
    // 1. Check if podman binary is available
    await execPromise(getBinaryPath('podman'), ['--version']);

    // 2. On Mac/Windows, check machine status
    if (process.platform === 'darwin' || process.platform === 'win32') {
      

      const { stdout } = await execPromise(getBinaryPath('podman'), ['machine', 'ls', '--format', 'json']);
      const machines = JSON.parse(stdout || '[]');
      
      if (machines.length === 0) {
        logger.info('No podman machine found, initializing default...');
        await execPromise(getBinaryPath('podman'), ['machine', 'init']);
      }

      // Check machine status
      const { stdout: statusOutput } = await execPromise(getBinaryPath('podman'), ['machine', 'ls', '--format', 'json']);
      const refreshedMachines = JSON.parse(statusOutput || '[]');
      const machineState = (refreshedMachines[0]?.State || refreshedMachines[0]?.Status || 'unknown').toLowerCase();
      
      const isRunning = machineState === 'running';
      const isStarting = machineState === 'starting';

      if (isStarting) {
        logger.info('Podman machine is currently starting, waiting for it to be ready...');
        // Wait up to 30 seconds for it to transition to running
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const { stdout: pollOutput } = await execPromise(getBinaryPath('podman'), ['machine', 'ls', '--format', 'json']);
          const pollMachines = JSON.parse(pollOutput || '[]');
          const pollState = (pollMachines[0]?.State || pollMachines[0]?.Status || '').toLowerCase();
          if (pollState === 'running') {
            logger.info('Podman machine is now running.');
            return true;
          }
        }
      }

      if (!isRunning) {
        logger.info(`Podman machine state is ${machineState}, starting...`);
        try {
          await execPromise(getBinaryPath('podman'), ['machine', 'start']);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('proxy already running')) {
            logger.warn('Podman proxy already running but machine state is not running. Cleaning up stale proxy...');
            if (process.platform === 'darwin') {
              try { await execPromise('pkill', ['-9', 'gvproxy']); } catch { logger.warn('No stale gvproxy process found.'); }
              try { await execPromise('pkill', ['-9', 'vfkit']); } catch { logger.warn('No stale vfkit process found.'); }
            }
            logger.info('Retrying podman machine start after stale proxy cleanup...');
            await execPromise(getBinaryPath('podman'), ['machine', 'start']);
          } else {
            logger.error(`Failed to start podman machine: ${message}`);
            return false;
          }
        }
      }

      // Health check with increased timeout (15s)
      try {
        await execPromise(getBinaryPath('podman'), ['ps'], undefined, undefined, undefined, 15000);
      } catch (err) {
        logger.warn(`Podman health check failed (timeout or error): ${err}. Auto-healing...`);
        if (process.platform === 'darwin') {
          try { await execPromise('pkill', ['-9', 'vfkit']); } catch { logger.warn('No stale vfkit process found.'); }
          try { await execPromise('pkill', ['-9', 'gvproxy']); } catch { logger.warn('No stale gvproxy process found.'); }
        }
        try { await execPromise(getBinaryPath('podman'), ['machine', 'stop']); } catch { logger.warn('Podman machine stop failed during auto-heal.'); }
        
        logger.info('Restarting podman machine after auto-heal...');
        try {
          await execPromise(getBinaryPath('podman'), ['machine', 'start']);
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : String(startErr);
          if (msg.includes('proxy already running')) {
            logger.info('Proxy already running after restart, assuming engine is coming up.');
          } else {
            logger.error(`Failed to auto-heal podman machine: ${msg}`);
            return false;
          }
        }
      }
      return true;
    }
    return true;
  } catch (err) {
    logger.error(`Failed to ensure podman runtime: ${err}`);
    return false;
  } finally {
    logger.info('Releasing machine operation lock');
    release!();
  }
}
