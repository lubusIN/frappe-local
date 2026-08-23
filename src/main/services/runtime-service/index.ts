import { execPromise, getBinaryPath } from '@frappe-local/main/utils';
import { cleanupStaleMacPodmanProcesses, getPodmanMachines, isPodmanMachineRequired } from '@frappe-local/main/utils/podman';

import { createMainLogger } from '@frappe-local/main/logger';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { exec as execCommand } from 'node:child_process';
import type { PodmanMachineStatus } from '@frappe-local/main/utils/podman/podman';
import { PODMAN_RUNTIME_TIMEOUTS } from '@frappe-local/main/constants';

const logger = createMainLogger('runtime');
import { isWslInstalled, installWslTask } from './wsl';
import { 
  configurePodmanMemoryProvider, 
  configureWslConfigPathProvider, 
  updateWslConfigMemory,
  normalizePodmanMemoryMb,
  getConfiguredPodmanMemoryMb,
  writeWslMemoryConfig
} from './memory';

export const FRAPPE_LOCAL_MACHINE_NAME = 'frappe-local';
const FRAPPE_LOCAL_WSL_DISTRO_NAME = `podman-${FRAPPE_LOCAL_MACHINE_NAME}`;

let lastRuntimeError: string | null = null;

export const getLastRuntimeError = (): string | null => lastRuntimeError;


export async function ensureRuntimeRunning(onLog?: (message: string) => void): Promise<boolean> {
  return ensurePodmanRunning(onLog);
}

export async function stopRuntime(onLog?: (message: string) => void): Promise<void> {
  try {
    await runPodman(['machine', 'stop', FRAPPE_LOCAL_MACHINE_NAME], 'Stopping Podman machine', undefined, onLog);
  } catch (error) {
    logger.error(`Failed to stop runtime: ${errorMessage(error)}`);
  }
}

export async function isRuntimeRunning(): Promise<boolean> {
  try {
    const machines = await getPodmanMachines();
    const machine = machines.find((m) => m.Name === FRAPPE_LOCAL_MACHINE_NAME);
    return machine?.Running || machine?.CurrentlyRunning || machine?.State === 'running' || false;
  } catch {
    return false;
  }
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

const ensurePodmanRestartService = async (onLog?: (message: string) => void): Promise<void> => {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      await runPodman(
        ['machine', 'ssh', FRAPPE_LOCAL_MACHINE_NAME, 'systemctl --user enable --now podman-restart.service'],
        'Enabling podman-restart service',
        undefined,
        onLog
      );
    } catch (err) {
      logger.warn(`Failed to enable podman-restart.service: ${err}`);
    }
  }
};

export const ensureWindowsDevContainerSupport = async (
  onLog?: (message: string) => void
): Promise<void> => {
  if (process.platform !== 'win32') {
    return;
  }

  const operation = 'Configuring Docker compatibility for VS Code Dev Containers';
  const linuxComposePath = getBinaryPath('docker-compose-linux.bin');
  const linuxDockerCliPath = getBinaryPath('docker-cli-linux.bin');
  const dockerWrapperPath = getBinaryPath('docker-wsl-wrapper.sh');
  const enternsProfilePath = getBinaryPath('enterns-profile.sh');
  const setupScript = [
    'compose_source="$(wslpath -u "$1")"',
    'docker_cli_source="$(wslpath -u "$2")"',
    'docker_wrapper_source="$(wslpath -u "$3")"',
    'enterns_profile_source="$(wslpath -u "$4")"',
    'mkdir -p /usr/libexec/docker/cli-plugins /usr/libexec/frappe-local',
    'if ! cmp -s "$compose_source" /usr/libexec/docker/cli-plugins/docker-compose; then install -m 0755 "$compose_source" /usr/libexec/docker/cli-plugins/docker-compose; fi',
    'if ! cmp -s "$docker_cli_source" /usr/libexec/frappe-local/docker; then install -m 0755 "$docker_cli_source" /usr/libexec/frappe-local/docker; fi',
    'if ! cmp -s "$enterns_profile_source" /etc/profile.d/enterns.sh; then install -m 0644 "$enterns_profile_source" /etc/profile.d/enterns.sh; fi',
    'systemd_pid="$(/usr/bin/pgrep -o -x systemd)"',
    'test -n "$systemd_pid" && test -e "/proc/$systemd_pid/ns/pid"',
    'if ! /usr/sbin/runuser -u user -- /usr/bin/podman --remote --url unix:///mnt/wsl/frappe-local-devcontainer.sock info >/dev/null 2>&1; then { /usr/bin/nsenter -m -p -t "$systemd_pid" --wdns=/tmp /usr/sbin/runuser -u user -- /usr/bin/env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/systemctl --user stop frappe-local-devcontainer-api.service >/dev/null 2>&1 || true; }; rm -f /mnt/wsl/frappe-local-devcontainer.sock; /usr/bin/nsenter -m -p -t "$systemd_pid" --wdns=/tmp /usr/sbin/runuser -u user -- /usr/bin/env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/systemd-run --user --unit=frappe-local-devcontainer-api --collect --property=Restart=always /usr/bin/podman --remote=false system service --time=0 unix:///mnt/wsl/frappe-local-devcontainer.sock; i=0; while [ ! -S /mnt/wsl/frappe-local-devcontainer.sock ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done; test -S /mnt/wsl/frappe-local-devcontainer.sock; fi',
    'rm -f /usr/bin/docker',
    'install -m 0755 "$docker_wrapper_source" /usr/bin/docker',
    'ln -sfn /usr/libexec/docker/cli-plugins/docker-compose /usr/bin/docker-compose',
  ].join(' && ');
  const result = await execPromise(
    'wsl.exe',
    [
      '--distribution',
      FRAPPE_LOCAL_WSL_DISTRO_NAME,
      '--user',
      'root',
      '--exec',
      '/bin/sh',
      '-c',
      setupScript,
      'frappe-local-devcontainer-setup',
      linuxComposePath,
      linuxDockerCliPath,
      dockerWrapperPath,
      enternsProfilePath,
    ],
    undefined,
    undefined,
    undefined,
    { idleTimeout: 15000, maxTimeout: 30000 }
  );

  if (result.code !== 0) {
    const remediation = `Restart Frappe Local, then retry. Bundled runtime paths: ${linuxComposePath}, ${linuxDockerCliPath}, ${dockerWrapperPath}`;
    throw new Error(`${commandFailureMessage(operation, result)} ${remediation}`);
  }

  const message = 'Docker compatibility for VS Code Dev Containers is ready.';
  logger.info(message);
  onLog?.(message);
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
  const normalizedMemoryMb = normalizePodmanMemoryMb(memoryMb);

  if (process.platform === 'win32') {
    const wasChanged = writeWslMemoryConfig(normalizedMemoryMb);
    if (!wasChanged) {
      return;
    }

    const msg = `Setting WSL2 memory to ${normalizedMemoryMb} MiB. This restarts all WSL distributions...`;
    logger.info(msg);
    onLog?.(msg);
    const shutdownResult = await execPromise(
      'wsl.exe',
      ['--shutdown'],
      undefined,
      undefined,
      undefined,
      { idleTimeout: 60000, maxTimeout: 120000 }
    );
    if (shutdownResult.code !== 0) {
      throw new Error(commandFailureMessage('Restarting WSL after memory update', shutdownResult));
    }

    if (!machine) {
      return;
    }

    await runPodman(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME], 'Restarting Podman machine', undefined, onLog);
    await waitForPodmanEngine(onLog);
    return;
  }

  if (!machine) {
    return;
  }

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
      let machines: PodmanMachineStatus[];
      try {
        machines = await getPodmanMachines();
      } catch (err) {
        if (process.platform === 'win32' && errorMessage(err).toLowerCase().includes('timed out')) {
          logWarn('Podman machine ls timed out. WSL might be deadlocked. Forcefully terminating WSL VM...');
          await new Promise<void>((resolve) => execCommand(`wsl --terminate ${FRAPPE_LOCAL_WSL_DISTRO_NAME}`, () => resolve()));
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
        if (process.platform === 'win32') {
          const wslMemoryChanged = writeWslMemoryConfig(memoryMb);
          if (wslMemoryChanged) {
            logMsg(`Configured WSL2 to use ${memoryMb} MiB. Restarting WSL before initialization...`);
            const shutdownResult = await execPromise(
              'wsl.exe',
              ['--shutdown'],
              undefined,
              undefined,
              undefined,
              { idleTimeout: 60000, maxTimeout: 120000 }
            );
            if (shutdownResult.code !== 0) {
              throw new Error(commandFailureMessage('Restarting WSL after memory update', shutdownResult));
            }
          }
        }
        await runPodman(
          process.platform === 'win32'
            ? ['machine', 'init', '--now', FRAPPE_LOCAL_MACHINE_NAME]
            : ['machine', 'init', '--now', '--cpus', '4', '--memory', String(memoryMb), FRAPPE_LOCAL_MACHINE_NAME],
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
            await ensurePodmanRestartService(onLog);
            await ensureWindowsDevContainerSupport(onLog);
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
            logWarn('Frappe Local Podman VM appears stuck. Restarting only its WSL distribution...');
            try {
              await new Promise<void>((resolve, reject) => {
                execCommand(`wsl --terminate ${FRAPPE_LOCAL_WSL_DISTRO_NAME}`, (error) => {
                  if (error) reject(error);
                  else resolve();
                });
              });
              logMsg('Frappe Local Podman WSL distribution stopped. Retrying machine start...');
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
      await ensurePodmanRestartService(onLog);
      await ensureWindowsDevContainerSupport(onLog);
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

export {
  isWslInstalled,
  installWslTask,
  configurePodmanMemoryProvider,
  configureWslConfigPathProvider,
  updateWslConfigMemory
};