import { execPromise, getBinaryPath } from '@frappe-local/main/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parsePodmanJson = (output: string): any => {
  try {
    // Podman might output warnings before JSON
    const jsonStart = output.indexOf('[');
    const jsonStartObj = output.indexOf('{');
    let start = -1;

    if (jsonStart !== -1 && (jsonStartObj === -1 || jsonStart < jsonStartObj)) {
      start = jsonStart;
    } else {
      start = jsonStartObj;
    }

    if (start === -1) return [];
    return JSON.parse(output.substring(start));
  } catch {
    return [];
  }
};

export const isPodmanMachineRequired = (): boolean => {
  return process.platform === 'darwin' || process.platform === 'win32';
};

export type PodmanMachineStatus = {
  CurrentlyRunning?: boolean;
  Running?: boolean;
  Starting?: boolean;
  State?: string;
  Name?: string;
  Status?: string;
};

export const getPodmanMachines = async (): Promise<PodmanMachineStatus[]> => {
  const { stdout, stderr, code } = await execPromise(
    getBinaryPath('podman'),
    ['machine', 'ls', '--format', 'json'],
    undefined,
    undefined,
    undefined,
    { idleTimeout: 10000 }
  );
  if (code !== 0) {
    throw new Error(stderr.trim() || `podman machine ls exited with code ${code}`);
  }

  const parsed = parsePodmanJson(stdout);
  return Array.isArray(parsed) ? parsed : [];
};

export const cleanupStaleMacPodmanProcesses = async (logger?: { warn: (msg: string) => void }): Promise<void> => {
  if (process.platform !== 'darwin') return;

  try { await execPromise('pkill', ['-9', 'gvproxy']); } catch { logger?.warn('No stale gvproxy process found.'); }
  try { await execPromise('pkill', ['-9', 'vfkit']); } catch { logger?.warn('No stale vfkit process found.'); }
};
