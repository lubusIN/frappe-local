import { execPromise } from '../utils/exec';
import { isPodmanMachineRequired, getPodmanMachines, cleanupStaleMacPodmanProcesses } from '../utils/podman/podman';
import { getBinaryPath } from '../utils/binaries';
import { createMainLogger } from '../logger';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { MIN_PODMAN_MEMORY_MB } from '../../shared/domain/models';
import { PODMAN_RUNTIME_TIMEOUTS } from '../constants';

const logger = createMainLogger('runtime');

export const LOCAL_BENCH_MACHINE_NAME = 'local-bench';

let podmanMemoryProvider = async (): Promise<number> => MIN_PODMAN_MEMORY_MB;
let lastRuntimeError: string | null = null;

export const getLastRuntimeError = (): string | null => lastRuntimeError;

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

const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const commandFailureMessage = (
  operation: string,
  result: { stdout: string; stderr: string; code: number | null }
): string => {
  const output = (result.stderr || result.stdout).trim().slice(-4000);
  return output
    ? `${operation} failed: ${output}`
    : `${operation} failed with exit code ${result.code ?? 'unknown'}.`;
};

const runPodman = async (
  args: string[],
  operation: string,
  timeoutConfig: { idleTimeout?: number; maxTimeout?: number } = {
    idleTimeout: PODMAN_RUNTIME_TIMEOUTS.MACHINE_COMMAND,
  }
): Promise<{ stdout: string; stderr: string; code: number | null }> => {
  const result = await execPromise(
    getBinaryPath('podman'),
    args,
    undefined,
    (output) => {
      const message = output.trim();
      if (message) logger.info(message);
    },
    undefined,
    timeoutConfig
  );
  if (result.code !== 0) {
    throw new Error(commandFailureMessage(operation, result));
  }
  return result;
};

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
      let socketPath = '';

      // Try machine inspect first (most reliable for machine-based podman).
      try {
        const { stdout } = await runPodman(
          ['machine', 'inspect', LOCAL_BENCH_MACHINE_NAME, '--format', '{{.ConnectionInfo.PodmanSocket.Path}}'],
          'Inspecting Podman socket'
        );
        socketPath = stdout.trim();
      } catch (error) {
        logger.warn(`Failed to inspect dedicated Podman socket: ${errorMessage(error)}`);
      }
      
      // If that fails, try podman info (works if the machine is already the default context).
      if (!socketPath) {
        const infoResult = await runPodman(
          ['info', '--format', '{{.Host.RemoteSocket.Path}}'],
          'Inspecting Podman connection'
        );
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
    const { stdout } = await runPodman(
      ['machine', 'inspect', LOCAL_BENCH_MACHINE_NAME, '--format', '{{.Resources.Memory}}'],
      'Inspecting Podman machine memory',
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
    await runPodman(['machine', 'stop', LOCAL_BENCH_MACHINE_NAME], 'Stopping Podman machine');
  }

  try {
    logger.info(`Setting ${LOCAL_BENCH_MACHINE_NAME} memory to ${normalizedMemoryMb} MiB...`);
    await runPodman(
      ['machine', 'set', '--memory', String(normalizedMemoryMb), LOCAL_BENCH_MACHINE_NAME],
      'Updating Podman machine memory'
    );
  } finally {
    if (wasRunning) {
      await runPodman(['machine', 'start', LOCAL_BENCH_MACHINE_NAME], 'Restarting Podman machine');
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

const waitForPodmanEngine = async (): Promise<void> => {
  const deadline = Date.now() + PODMAN_RUNTIME_TIMEOUTS.ENGINE_READY;
  let lastError = 'Podman engine did not become ready.';

  while (Date.now() < deadline) {
    try {
      await runPodman(
        ['--connection', `${LOCAL_BENCH_MACHINE_NAME}-root`, 'ps'],
        'Checking Podman engine',
        { idleTimeout: 15000 }
      );
      return;
    } catch (error) {
      lastError = errorMessage(error);
      await new Promise((resolve) =>
        setTimeout(resolve, PODMAN_RUNTIME_TIMEOUTS.ENGINE_POLL_INTERVAL)
      );
    }
  }

  throw new Error(`${lastError} Timed out waiting for the Podman engine.`);
};

async function ensurePodmanRunning(): Promise<boolean> {
  const release = await acquireMachineOperationLock();

  try {
    lastRuntimeError = null;
    logger.info('Acquired machine operation lock');
    
    // 1. Check if podman binary is available
    await runPodman(['--version'], 'Checking bundled Podman');

    // 2. On Mac/Windows, check machine status
    if (isPodmanMachineRequired()) {
      const machines = await getPodmanMachines();
      let machine = machines.find((m) => m.Name === LOCAL_BENCH_MACHINE_NAME);
      
      if (!machine) {
        const memoryMb = await getConfiguredPodmanMemoryMb();
        logger.info(`No podman machine named ${LOCAL_BENCH_MACHINE_NAME} found, initializing...`);
        await runPodman(
          ['machine', 'init', '--now', '--cpus', '4', '--memory', String(memoryMb), LOCAL_BENCH_MACHINE_NAME],
          'Initializing Podman machine',
          {
            idleTimeout: PODMAN_RUNTIME_TIMEOUTS.MACHINE_INIT_IDLE,
            maxTimeout: PODMAN_RUNTIME_TIMEOUTS.MACHINE_INIT_MAX,
          }
        );
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
            await waitForPodmanEngine();
            return true;
          }
        }
      }

      if (!isRunning) {
        logger.info(`Podman machine is not running, starting ${LOCAL_BENCH_MACHINE_NAME}...`);
        try {
          await runPodman(['machine', 'start', LOCAL_BENCH_MACHINE_NAME], 'Starting Podman machine');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const normalizedMessage = message.toLowerCase();
          if (normalizedMessage.includes('proxy already running')) {
            logger.warn('Podman proxy already running but machine state is not running. Cleaning up stale proxy...');
            await cleanupStaleMacPodmanProcesses(logger);
            logger.info('Retrying podman machine start after stale proxy cleanup...');
            await runPodman(['machine', 'start', LOCAL_BENCH_MACHINE_NAME], 'Starting Podman machine');
          } else if (normalizedMessage.includes('only one vm can be active')) {
            logger.warn('Another Podman VM is active. Stopping default machine to allow local-bench to run...');
            try {
              await runPodman(['machine', 'stop', 'podman-machine-default'], 'Stopping another Podman machine');
            } catch {
              logger.warn('Default Podman machine could not be stopped.');
            }
            await runPodman(['machine', 'start', LOCAL_BENCH_MACHINE_NAME], 'Starting Podman machine');
          } else {
            throw err;
          }
        }
      }

      try {
        await waitForPodmanEngine();
      } catch (err) {
        logger.warn(`Podman health check failed (timeout or error): ${err}. Auto-healing...`);
        await cleanupStaleMacPodmanProcesses(logger);
        try {
          await runPodman(['machine', 'stop', LOCAL_BENCH_MACHINE_NAME], 'Stopping Podman machine');
        } catch {
          logger.warn('Podman machine stop failed during auto-heal.');
        }
        
        logger.info('Restarting podman machine after auto-heal...');
        try {
          await runPodman(['machine', 'start', LOCAL_BENCH_MACHINE_NAME], 'Restarting Podman machine');
          await waitForPodmanEngine();
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : String(startErr);
          if (msg.toLowerCase().includes('proxy already running')) {
            logger.info('Proxy already running after restart; waiting for the engine.');
            await waitForPodmanEngine();
          } else {
            throw startErr;
          }
        }
      }
      return true;
    }
    return true;
  } catch (err) {
    lastRuntimeError = errorMessage(err);
    logger.error(`Failed to ensure podman runtime: ${lastRuntimeError}`);
    return false;
  } finally {
    logger.info('Releasing machine operation lock');
    release();
  }
}
