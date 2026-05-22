import { execPromise } from '../exec';
import { errorMessage } from '../../../shared/core/utils';

type CleanupLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

/** Run a podman command and return stdout split into non-empty lines. */
export const listPodmanResources = async (
  podmanBinary: string,
  args: string[],
  runtimeEnv: NodeJS.ProcessEnv,
  timeout: number
): Promise<string[]> => {
  try {
    const { code, stdout } = await execPromise(podmanBinary, args, undefined, undefined, runtimeEnv, timeout);
    if (code !== 0) return [];
    return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
};

/** Remove containers, volumes, and networks matching a label or name filter. */
export const cleanupPodmanResources = async (
  podmanBinary: string,
  filterArgs: { containers: string[]; volumes: string[]; networks: string[] },
  runtimeEnv: NodeJS.ProcessEnv,
  timeout: number,
  logger?: CleanupLogger
): Promise<void> => {
  const containerIds = await listPodmanResources(podmanBinary, filterArgs.containers, runtimeEnv, timeout);
  if (containerIds.length > 0) {
    try {
      await execPromise(podmanBinary, ['rm', '-f', ...containerIds], undefined, undefined, runtimeEnv, timeout);
      logger?.info(`Removed ${containerIds.length} lingering containers`);
    } catch (error) {
      logger?.warn(`Failed to remove lingering containers: ${errorMessage(error)}`);
    }
  }

  const volumeNames = await listPodmanResources(podmanBinary, filterArgs.volumes, runtimeEnv, timeout);
  if (volumeNames.length > 0) {
    try {
      await execPromise(podmanBinary, ['volume', 'rm', '-f', ...volumeNames], undefined, undefined, runtimeEnv, timeout);
      logger?.info(`Removed ${volumeNames.length} lingering volumes`);
    } catch (error) {
      logger?.warn(`Failed to remove lingering volumes: ${errorMessage(error)}`);
    }
  }

  const networkNames = await listPodmanResources(podmanBinary, filterArgs.networks, runtimeEnv, timeout);
  if (networkNames.length > 0) {
    try {
      await execPromise(podmanBinary, ['network', 'rm', ...networkNames], undefined, undefined, runtimeEnv, timeout);
      logger?.info(`Removed ${networkNames.length} lingering networks`);
    } catch (error) {
      logger?.warn(`Failed to remove lingering networks: ${errorMessage(error)}`);
    }
  }
};

/** Build filter args for resources belonging to a specific compose project. */
export const projectFilterArgs = (projectName: string) => {
  const label = `label=com.docker.compose.project=${projectName}`;
  return {
    containers: ['ps', '-a', '--filter', label, '--format', '{{.ID}}'],
    volumes: ['volume', 'ls', '--filter', label, '--format', '{{.Name}}'],
    networks: ['network', 'ls', '--filter', label, '--format', '{{.Name}}'],
  };
};

/** Build filter args for resources matching a name prefix. */
export const nameFilterArgs = (prefix: string) => ({
  containers: ['ps', '-a', '--filter', `name=${prefix}`, '--format', '{{.ID}}'],
  volumes: ['volume', 'ls', '--filter', `name=${prefix}`, '--format', '{{.Name}}'],
  networks: ['network', 'ls', '--filter', `name=${prefix}`, '--format', '{{.Name}}'],
});
