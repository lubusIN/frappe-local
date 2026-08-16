import { execPromise, getBinaryPath } from '@frappe-local/main/utils';
import type { TaskExecutionContext } from '@frappe-local/main/services/task-runner';
import { cleanupStaleMacPodmanProcesses, getPodmanMachines, isPodmanMachineRequired } from '@frappe-local/main/utils/podman';

import { createMainLogger } from '@frappe-local/main/logger';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { MIN_PODMAN_MEMORY_MB } from '@frappe-local/shared/domain';
import { PODMAN_RUNTIME_TIMEOUTS } from '@frappe-local/main/constants';

const logger = createMainLogger('runtime');

export const FRAPPE_LOCAL_MACHINE_NAME = 'frappe-local';

let podmanMemoryProvider = async (): Promise<number> => MIN_PODMAN_MEMORY_MB;
let lastRuntimeError: string | null = null;

export const getLastRuntimeError = (): string | null => lastRuntimeError;

export const isWslInstalled = async (): Promise<boolean> => {
  if (process.platform !== 'win32') return true;
  try {
    const { code } = await execPromise('wsl.exe', ['--status'], undefined, undefined, undefined, { idleTimeout: 5000 });
    return code === 0;
  } catch {
    return false;
  }
};

export const installWslTask = async (context: TaskExecutionContext): Promise<void> => {
  if (process.platform !== 'win32') return;

  context.startStep('wsl-install', 'Installing Windows Subsystem for Linux (WSL2)');
  context.log('info', 'Preparing WSL installation...', 'wsl-install');

  const crypto = await import('node:crypto');
  const logFile = path.join(os.tmpdir(), `wsl-install-${crypto.randomUUID()}.log`);
  fs.writeFileSync(logFile, '', 'utf8');

  let position = 0;
  const pollLogs = () => {
    try {
      if (!fs.existsSync(logFile)) return;
      const fd = fs.openSync(logFile, 'r');
      const stat = fs.fstatSync(fd);
      if (stat.size > position) {
        const buffer = Buffer.alloc(stat.size - position);
        fs.readSync(fd, buffer, 0, buffer.length, position);
        position = stat.size;
        fs.closeSync(fd);

        // Remove null bytes which powershell sometimes outputs, and split lines
        const text = buffer.toString('utf8').replace(/\x00/g, '');
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (line.trim()) {
            context.log('info', line.trim(), 'wsl-install');
          }
        }
      } else {
        fs.closeSync(fd);
      }
    } catch {
      // ignore
    }
  };

  const timer = setInterval(pollLogs, 500);

  try {
    context.log('info', 'Requesting elevated privileges. Please accept the UAC prompt if it appears...', 'wsl-install');

    // Run powershell to spawn an elevated powershell that runs wsl and redirects output
    const psCommand = `Start-Process powershell.exe -ArgumentList "-NoProfile -Command \`"wsl.exe --install *>&1 | Out-File -FilePath '${logFile}' -Encoding utf8\`"" -Verb RunAs -WindowStyle Hidden -Wait`;

    const { code, stderr } = await execPromise('powershell.exe', [
      '-NoProfile',
      '-Command',
      psCommand
    ], undefined, undefined, undefined, { idleTimeout: 600000, maxTimeout: 1200000 });

    clearInterval(timer);
    pollLogs();

    if (code !== 0) {
      throw new Error(`Elevated WSL installation failed with exit code ${code}. ${stderr}`);
    }

    context.completeStep('wsl-install', 'Installing Windows Subsystem for Linux (WSL2)', 'WSL installation completed successfully.');
  } finally {
    clearInterval(timer);
    try {
      if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    } catch {
      // ignore
    }
  }
};

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

export async function ensureRuntimeRunning(onLog?: (message: string) => void): Promise<boolean> {
  return ensurePodmanRunning(onLog);
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

const getPodmanBaseEnv = (): NodeJS.ProcessEnv => {
  try {
    const podmanBinDir = path.dirname(getBinaryPath('podman'));
    const currentPath = process.env.PATH || '';
    const enhancedPath = podmanBinDir ? `${podmanBinDir}${path.delimiter}${currentPath}` : currentPath;
    return {
      ...(process.platform === 'win32' ? { CONTAINERS_HELPER_BINARY_DIR: podmanBinDir } : {}),
      PATH: enhancedPath,
    };
  } catch {
    return {};
  }
};

const runPodman = async (
  args: string[],
  operation: string,
  timeoutConfig: { idleTimeout?: number; maxTimeout?: number } = {
    idleTimeout: PODMAN_RUNTIME_TIMEOUTS.MACHINE_COMMAND,
  },
  onLog?: (message: string) => void
): Promise<{ stdout: string; stderr: string; code: number | null }> => {
  const logHandler = (output: string) => {
    const message = output.trim();
    if (message) {
      logger.info(message);
      onLog?.(message);
    }
  };
  const baseEnv = getPodmanBaseEnv();
  const result = await execPromise(
    getBinaryPath('podman'),
    args,
    undefined,
    logHandler,
    baseEnv,
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
  const isolatedConfigDir = path.join(os.tmpdir(), 'frappe-local-docker-config');
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

  const baseEnv = getPodmanBaseEnv();
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    DOCKER_CONFIG: isolatedConfigDir,
  };

  if (isPodmanMachineRequired()) {
    try {
      let socketPath = '';

      // Try machine inspect first (most reliable for machine-based podman).
      try {
        const formatStr = process.platform === 'win32'
          ? '{{.ConnectionInfo.PodmanPipe.Path}}'
          : '{{.ConnectionInfo.PodmanSocket.Path}}';
        const { stdout } = await runPodman(
          ['machine', 'inspect', FRAPPE_LOCAL_MACHINE_NAME, '--format', formatStr],
          'Inspecting Podman socket'
        );
        socketPath = stdout.trim();

        if (!socketPath && process.platform === 'win32') {
          const fallbackRes = await runPodman(
            ['machine', 'inspect', FRAPPE_LOCAL_MACHINE_NAME, '--format', '{{.ConnectionInfo.PodmanSocket.Path}}'],
            'Inspecting Podman socket fallback'
          );
          socketPath = fallbackRes.stdout.trim();
        }
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
        if (process.platform === 'win32') {
          if (socketPath.startsWith('\\\\.\\pipe\\') || socketPath.startsWith('//./pipe/')) {
            const cleanPath = socketPath.replace(/\\/g, '/');
            const pipeName = cleanPath.replace(/^(\/\/)?\.\/pipe\//i, '').replace(/^\/+/, '');
            env.DOCKER_HOST = `npipe:////./pipe/${pipeName}`;
          } else if (socketPath.startsWith('npipe://')) {
            env.DOCKER_HOST = socketPath;
          } else {
            const unixPath = socketPath.replace(/\\/g, '/');
            env.DOCKER_HOST = unixPath.startsWith('/') ? `unix://${unixPath}` : `unix:///${unixPath}`;
          }
        } else {
          env.DOCKER_HOST = socketPath.startsWith('unix://') ? socketPath : `unix://${socketPath}`;
        }
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

const readMachineMemoryMb = async (onLog?: (message: string) => void): Promise<number | null> => {
  try {
    const { stdout } = await runPodman(
      ['machine', 'inspect', FRAPPE_LOCAL_MACHINE_NAME, '--format', '{{.Resources.Memory}}'],
      'Inspecting Podman machine memory',
      { idleTimeout: 10000 },
      onLog
    );
    const memoryMb = Number.parseInt(stdout.trim(), 10);
    return Number.isInteger(memoryMb) ? memoryMb : null;
  } catch {
    return null;
  }
};

const applyPodmanMachineMemoryUnlocked = async (memoryMb: number, onLog?: (message: string) => void): Promise<void> => {
  if (!isPodmanMachineRequired()) {
    return;
  }

  const machines = await getPodmanMachines();
  const machine = machines.find((entry) => entry.Name === FRAPPE_LOCAL_MACHINE_NAME);
  if (!machine) {
    return;
  }

  const normalizedMemoryMb = normalizePodmanMemoryMb(memoryMb);
  const currentMemoryMb = await readMachineMemoryMb(onLog);
  if (currentMemoryMb === normalizedMemoryMb) {
    return;
  }

  const wasRunning = isMachineRunning(machine);
  if (wasRunning) {
    const msg = `Stopping ${FRAPPE_LOCAL_MACHINE_NAME} to update memory allocation...`;
    logger.info(msg);
    onLog?.(msg);
    await runPodman(['machine', 'stop', FRAPPE_LOCAL_MACHINE_NAME], 'Stopping Podman machine', undefined, onLog);
  }

  try {
    const msg = `Setting ${FRAPPE_LOCAL_MACHINE_NAME} memory to ${normalizedMemoryMb} MiB...`;
    logger.info(msg);
    onLog?.(msg);
    await runPodman(
      ['machine', 'set', '--memory', String(normalizedMemoryMb), FRAPPE_LOCAL_MACHINE_NAME],
      'Updating Podman machine memory',
      undefined,
      onLog
    );
  } finally {
    if (wasRunning) {
      await runPodman(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME], 'Restarting Podman machine', undefined, onLog);
    }
  }
};

export const applyPodmanMachineMemory = async (memoryMb: number, onLog?: (message: string) => void): Promise<void> => {
  const release = await acquireMachineOperationLock();
  try {
    await applyPodmanMachineMemoryUnlocked(memoryMb, onLog);
  } finally {
    release();
  }
};

const waitForPodmanEngine = async (onLog?: (message: string) => void): Promise<void> => {
  const deadline = Date.now() + PODMAN_RUNTIME_TIMEOUTS.ENGINE_READY;
  let lastError = 'Podman engine did not become ready.';

  while (Date.now() < deadline) {
    try {
      await runPodman(
        ['--connection', `${FRAPPE_LOCAL_MACHINE_NAME}-root`, 'ps'],
        'Checking Podman engine',
        { idleTimeout: 15000 },
        onLog
      );

      if (process.platform === 'win32') {
        const runtimeEnv = await getRuntimeEnv();
        if (runtimeEnv.DOCKER_HOST) {
          const composePath = getBinaryPath('docker-compose');
          const testRes = await execPromise(
            composePath,
            ['version'],
            undefined,
            undefined,
            runtimeEnv,
            { idleTimeout: 10000 }
          );
          if (testRes.code !== 0) {
            throw new Error(`Windows Docker API pipe not responding: ${testRes.stderr || testRes.stdout}`);
          }
        }
      }

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

async function ensurePodmanRunning(onLog?: (message: string) => void): Promise<boolean> {
  const logMsg = (msg: string) => {
    logger.info(msg);
    onLog?.(msg);
  };
  const logWarn = (msg: string) => {
    logger.warn(msg);
    onLog?.(`WARN: ${msg}`);
  };

  const release = await acquireMachineOperationLock();

  try {
    lastRuntimeError = null;
    logMsg('Acquired machine operation lock');

    // 1. Check if podman binary is available
    await runPodman(['--version'], 'Checking bundled Podman', undefined, onLog);

    // 2. On Mac/Windows, check machine status
    if (isPodmanMachineRequired()) {
      let machines: any[];
      try {
        machines = await getPodmanMachines();
      } catch (err) {
        if (process.platform === 'win32' && errorMessage(err).toLowerCase().includes('timed out')) {
          logWarn('Podman machine ls timed out. WSL might be deadlocked. Forcefully terminating WSL VM...');
          const cp = require('child_process');
          await new Promise<void>((resolve) => cp.exec(`wsl --terminate podman-${FRAPPE_LOCAL_MACHINE_NAME}`, () => resolve()));
          logMsg('Retrying podman machine ls...');
          machines = await getPodmanMachines();
        } else {
          throw err;
        }
      }
      let machine = machines.find((m) => m.Name === FRAPPE_LOCAL_MACHINE_NAME);

      if (!machine) {
        const memoryMb = await getConfiguredPodmanMemoryMb();
        logMsg(`No podman machine named ${FRAPPE_LOCAL_MACHINE_NAME} found, initializing...`);
        await runPodman(
          ['machine', 'init', '--now', '--cpus', '4', '--memory', String(memoryMb), FRAPPE_LOCAL_MACHINE_NAME],
          'Initializing Podman machine',
          {
            idleTimeout: PODMAN_RUNTIME_TIMEOUTS.MACHINE_INIT_IDLE,
            maxTimeout: PODMAN_RUNTIME_TIMEOUTS.MACHINE_INIT_MAX,
          },
          onLog
        );
      } else {
        await applyPodmanMachineMemoryUnlocked(await getConfiguredPodmanMemoryMb(), onLog);
      }

      // Check machine status
      const refreshedMachines = await getPodmanMachines();
      machine = refreshedMachines.find((m) => m.Name === FRAPPE_LOCAL_MACHINE_NAME);

      const isRunning = isMachineRunning(machine);
      const isStarting = machine?.Starting === true || (machine?.State || machine?.Status || '').toLowerCase() === 'starting';

      if (isStarting) {
        logMsg('Podman machine is currently starting, waiting for it to be ready...');
        // Wait up to 30 seconds for it to transition to running
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const pollMachines = await getPodmanMachines();
          const pollMachine = pollMachines.find((m) => m.Name === FRAPPE_LOCAL_MACHINE_NAME);
          const pollState = (pollMachine?.State || pollMachine?.Status || '').toLowerCase();
          if (pollState === 'running') {
            logMsg('Podman machine is now running.');
            await waitForPodmanEngine(onLog);
            return true;
          }
        }
      }

      if (!isRunning) {
        logMsg(`Podman machine is not running, starting ${FRAPPE_LOCAL_MACHINE_NAME}...`);
        try {
          await runPodman(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME], 'Starting Podman machine', undefined, onLog);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const normalizedMessage = message.toLowerCase();
          if (normalizedMessage.includes('proxy already running')) {
            logWarn('Podman proxy already running but machine state is not running. Cleaning up stale proxy...');
            await cleanupStaleMacPodmanProcesses(logger);
            logMsg('Retrying podman machine start after stale proxy cleanup...');
            await runPodman(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME], 'Starting Podman machine', undefined, onLog);
          } else if (normalizedMessage.includes('only one vm can be active')) {
            logWarn('Another Podman VM is active. Stopping default machine to allow frappe-local to run...');
            try {
              await runPodman(['machine', 'stop', 'podman-machine-default'], 'Stopping another Podman machine', undefined, onLog);
            } catch {
              logWarn('Default Podman machine could not be stopped.');
            }
            await runPodman(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME], 'Starting Podman machine', undefined, onLog);
          } else if (process.platform === 'win32' && (normalizedMessage.includes('all pipe instances are busy') || normalizedMessage.includes('ssh error') || normalizedMessage.includes('machine is not listening on ssh port'))) {
            logWarn('WSL VM appears to be in a stuck/zombie state. Attempting to force restart WSL...');
            try {
              const { execPromise } = require('./bench-orchestration');
              const cp = require('child_process');
              await new Promise<void>((resolve, reject) => {
                cp.exec('wsl --shutdown', (error: any) => {
                  if (error) reject(error);
                  else resolve();
                });
              });
              logMsg('WSL has been forcefully restarted. Retrying podman machine start...');
              await runPodman(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME], 'Starting Podman machine', undefined, onLog);
            } catch (wslErr) {
              logWarn(`Failed to force restart WSL: ${wslErr}`);
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      try {
        await waitForPodmanEngine(onLog);
      } catch (err) {
        logWarn(`Podman health check failed (timeout or error): ${err}. Auto-healing...`);
        await cleanupStaleMacPodmanProcesses(logger);
        try {
          await runPodman(['machine', 'stop', FRAPPE_LOCAL_MACHINE_NAME], 'Stopping Podman machine', undefined, onLog);
        } catch {
          logWarn('Podman machine stop failed during auto-heal.');
        }

        logMsg('Restarting podman machine after auto-heal...');
        try {
          await runPodman(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME], 'Restarting Podman machine', undefined, onLog);
          await waitForPodmanEngine(onLog);
        } catch (startErr) {
          const msg = startErr instanceof Error ? startErr.message : String(startErr);
          if (msg.toLowerCase().includes('proxy already running')) {
            logMsg('Proxy already running after restart; waiting for the engine.');
            await waitForPodmanEngine(onLog);
          } else {
            throw startErr;
          }
        }
      }
      return true;
    }
    return true;
  } catch (err) {
    let rawError = errorMessage(err);
    if (process.platform === 'win32') {
      const lower = rawError.toLowerCase();
      if (
        lower.includes('virtualisation is not enabled') ||
        lower.includes('virtualization is not enabled') ||
        lower.includes('hcs_e_hyperv_not_installed') ||
        lower.includes('virtual machine platform') ||
        lower.includes('enablevirtualization')
      ) {
        rawError = 'Hardware virtualization is not enabled on your computer. Please enable "Virtual Machine Platform" in Windows Features and turn on Virtualization (VT-x / AMD-V / SVM) in your BIOS/firmware settings.';
      } else if (
        lower.includes('the windows subsystem for linux is not installed') ||
        lower.includes('wsl is not installed') ||
        (lower.includes('wsl') && (lower.includes('not installed') || lower.includes('has no installed distributions')))
      ) {
        rawError = 'WSL2 (Windows Subsystem for Linux) is not installed or initialized on your system. Please open PowerShell as Administrator, run "wsl --install", and restart your computer.';
      }
    }
    lastRuntimeError = rawError;
    logger.error(`Failed to ensure podman runtime: ${lastRuntimeError}`);
    onLog?.(`ERROR: Failed to ensure podman runtime: ${lastRuntimeError}`);
    return false;
  } finally {
    logMsg('Releasing machine operation lock');
    release();
  }
}
