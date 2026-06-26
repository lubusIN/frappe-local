import { execPromise, getBinaryPath } from '@frappe-local/main/utils';

export const parsePodmanJson = (output: string): unknown => {
  try {
    const jsonStarts = [output.indexOf('['), output.indexOf('{')].filter((index) => index !== -1);
    const start = jsonStarts.length > 0 ? Math.min(...jsonStarts) : -1;
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
