import { execPromise } from '../utils/exec';
import { isPodmanMachineRequired, getPodmanMachines, cleanupStaleMacPodmanProcesses } from '../utils/podman/podman';
import { getBinaryPath } from '../utils/binaries';
import { createMainLogger } from '../logger';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { MIN_PODMAN_MEMORY_MB } from '../../shared/domain/models';

const logger = createMainLogger('runtime');

export const LOCAL_BENCH_MACHINE_NAME = 'local-bench';

let podmanMemoryProvider = async (): Promise<number> => MIN_PODMAN_MEMORY_MB;

export const configurePodmanMemoryProvider = (
  provider: () => Promise<number>
): void => {
  podmanMemoryProvider = provider;
};

const normalizePodmanMemoryMb = (memoryMb: number): number => {
  const systemMemoryMb = Math.floor(os.totalmem() / (1024 * 1024));
  return Math.min(
    Math.max(Math.round(memoryMb), MIN_PODMAN_MEMORY_MB),
    Math.max(systemMemoryMb, MIN_PODMAN_MEMORY_MB)
  );
};

const getConfiguredPodmanMemoryMb = async (): Promise<number> => {
  try {
    return normalizePodmanMemoryMb(await podmanMemoryProvider());
  } catch (error) {
    logger.warn(`Failed to read Podman memory setting: ${error}`);
    return MIN_PODMAN_MEMORY_MB;
  }
};

export async function ensureRuntimeRunning(): Promise<boolean> {
  return ensurePodmanRunning();
}

export async function getRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
  // Create an isolated Docker config directory so docker-compose does NOT read
  // ~/.docker/config.json (which may have "currentContext": "desktop-linux"
  // that forces connection to Docker Desktop's socket instead of our Podman socket).
  const isolatedConfigDir = path.join(os.tmpdir(), 'local-bench-docker-config');
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
  
  if (isPodmanMachineRequired()) {
    try {
      // Try machine inspect first (most reliable for machine-based podman)
      const { stdout } = await execPromise(getBinaryPath('podman'), ['machine', 'inspect', LOCAL_BENCH_MACHINE_NAME, '--format', '{{.ConnectionInfo.PodmanSocket.Path}}']);
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

const acquireMachineOperationLock = async (): Promise<() => void> => {
  const previousLock = machineOperationLock;
  let release: () => void = () => undefined;
  machineOperationLock = new Promise((resolve) => {
    release = resolve;
  });
  await previousLock;
  return release;
};

const isMachineRunning = (machine: {
  Running?: boolean;
  CurrentlyRunning?: boolean;
  State?: string;
  Status?: string;
} | undefined): boolean => {
  return machine?.Running === true ||
    machine?.CurrentlyRunning === true ||
    (machine?.State || machine?.Status || '').toLowerCase() === 'running';
};

const readMachineMemoryMb = async (): Promise<number | null> => {
  try {
    const { stdout } = await execPromise(
      getBinaryPath('podman'),
      ['machine', 'inspect', LOCAL_BENCH_MACHINE_NAME, '--format', '{{.Resources.Memory}}'],
      undefined,
      undefined,
      undefined,
      { idleTimeout: 10000 }
    );
    const memoryMb = Number.parseInt(stdout.trim(), 10);
    return Number.isInteger(memoryMb) ? memoryMb : null;
  } catch {
    return null;
  }
};

const applyPodmanMachineMemoryUnlocked = async (memoryMb: number): Promise<void> => {
  if (!isPodmanMachineRequired()) {
    return;
  }

  const machines = await getPodmanMachines();
  const machine = machines.find((entry) => entry.Name === LOCAL_BENCH_MACHINE_NAME);
  if (!machine) {
    return;
  }

  const normalizedMemoryMb = normalizePodmanMemoryMb(memoryMb);
  const currentMemoryMb = await readMachineMemoryMb();
  if (currentMemoryMb === normalizedMemoryMb) {
    return;
  }

  const wasRunning = isMachineRunning(machine);
  if (wasRunning) {
    logger.info(`Stopping ${LOCAL_BENCH_MACHINE_NAME} to update memory allocation...`);
    await execPromise(getBinaryPath('podman'), ['machine', 'stop', LOCAL_BENCH_MACHINE_NAME]);
  }

  try {
    logger.info(`Setting ${LOCAL_BENCH_MACHINE_NAME} memory to ${normalizedMemoryMb} MiB...`);
    await execPromise(
      getBinaryPath('podman'),
      ['machine', 'set', '--memory', String(normalizedMemoryMb), LOCAL_BENCH_MACHINE_NAME]
    );
  } finally {
    if (wasRunning) {
      await execPromise(getBinaryPath('podman'), ['machine', 'start', LOCAL_BENCH_MACHINE_NAME]);
    }
  }
};

export const applyPodmanMachineMemory = async (memoryMb: number): Promise<void> => {
  const release = await acquireMachineOperationLock();
  try {
    await applyPodmanMachineMemoryUnlocked(memoryMb);
  } finally {
    release();
  }
};

async function ensurePodmanRunning(): Promise<boolean> {
  const release = await acquireMachineOperationLock();

  try {
    logger.info('Acquired machine operation lock');
    
    // 1. Check if podman binary is available
    await execPromise(getBinaryPath('podman'), ['--version']);

    // 2. On Mac/Windows, check machine status
    if (isPodmanMachineRequired()) {
      const machines = await getPodmanMachines();
      let machine = machines.find((m) => m.Name === LOCAL_BENCH_MACHINE_NAME);
      
      if (!machine) {
        const memoryMb = await getConfiguredPodmanMemoryMb();
        logger.info(`No podman machine named ${LOCAL_BENCH_MACHINE_NAME} found, initializing...`);
        await execPromise(getBinaryPath('podman'), ['machine', 'init', '--cpus', '4', '--memory', String(memoryMb), LOCAL_BENCH_MACHINE_NAME], undefined, undefined, undefined, { idleTimeout: 60000 });
      } else {
        await applyPodmanMachineMemoryUnlocked(await getConfiguredPodmanMemoryMb());
      }

      // Check machine status
      const refreshedMachines = await getPodmanMachines();
      machine = refreshedMachines.find((m) => m.Name === LOCAL_BENCH_MACHINE_NAME);
      
      const isRunning = isMachineRunning(machine);
      const isStarting = machine?.Starting === true || (machine?.State || machine?.Status || '').toLowerCase() === 'starting';

      if (isStarting) {
        logger.info('Podman machine is currently starting, waiting for it to be ready...');
        // Wait up to 30 seconds for it to transition to running
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const pollMachines = await getPodmanMachines();
          const pollMachine = pollMachines.find((m) => m.Name === LOCAL_BENCH_MACHINE_NAME);
          const pollState = (pollMachine?.State || pollMachine?.Status || '').toLowerCase();
          if (pollState === 'running') {
            logger.info('Podman machine is now running.');
            return true;
          }
        }
      }

      if (!isRunning) {
        logger.info(`Podman machine is not running, starting ${LOCAL_BENCH_MACHINE_NAME}...`);
        try {
          await execPromise(getBinaryPath('podman'), ['machine', 'start', LOCAL_BENCH_MACHINE_NAME]);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('proxy already running')) {
            logger.warn('Podman proxy already running but machine state is not running. Cleaning up stale proxy...');
            await cleanupStaleMacPodmanProcesses(logger);
            logger.info('Retrying podman machine start after stale proxy cleanup...');
            await execPromise(getBinaryPath('podman'), ['machine', 'start', LOCAL_BENCH_MACHINE_NAME]);
          } else if (message.includes('only one VM can be active')) {
            logger.warn('Another Podman VM is active. Stopping default machine to allow local-bench to run...');
            try {
              await execPromise(getBinaryPath('podman'), ['machine', 'stop', 'podman-machine-default']);
            } catch {
              logger.warn('Default Podman machine could not be stopped.');
            }
            await execPromise(getBinaryPath('podman'), ['machine', 'start', LOCAL_BENCH_MACHINE_NAME]);
          } else {
            logger.error(`Failed to start podman machine: ${message}`);
            return false;
          }
        }
      }

      // Health check with increased timeout (15s)
      try {
        await execPromise(getBinaryPath('podman'), ['--connection', `${LOCAL_BENCH_MACHINE_NAME}-root`, 'ps'], undefined, undefined, undefined, { idleTimeout: 15000 });
      } catch (err) {
        logger.warn(`Podman health check failed (timeout or error): ${err}. Auto-healing...`);
        await cleanupStaleMacPodmanProcesses(logger);
        try { await execPromise(getBinaryPath('podman'), ['machine', 'stop', LOCAL_BENCH_MACHINE_NAME]); } catch { logger.warn('Podman machine stop failed during auto-heal.'); }
        
        logger.info('Restarting podman machine after auto-heal...');
        try {
          await execPromise(getBinaryPath('podman'), ['machine', 'start', LOCAL_BENCH_MACHINE_NAME]);
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
    release();
  }
}
