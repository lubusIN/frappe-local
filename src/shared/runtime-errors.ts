const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*/i;

export const stripIpcPrefix = (message: string): string => message.replace(IPC_PREFIX, '').trim();

export const isLikelyOutOfMemory = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('code 137') ||
    normalized.includes('exit code 137') ||
    normalized.includes('out of memory') ||
    normalized.includes('oom') ||
    normalized.includes('signal: killed') ||
    (normalized.includes('killed') && normalized.includes('container'))
  );
};

const OOM_GUIDANCE = 'Podman ran out of memory while running containers. Increase Podman machine memory (recommended: 4096 MB+) and retry.';

export const humanizeCreateFailure = (resource: 'bench' | 'site', rawMessage: string): string => {
  const message = stripIpcPrefix(rawMessage);
  if (isLikelyOutOfMemory(message)) {
    const prefix = resource === 'bench' ? 'Bench creation failed' : 'Site creation failed';
    return `${prefix}: ${OOM_GUIDANCE}`;
  }

  if (resource === 'bench') {
    if (message.toLowerCase().includes('timed out')) {
      return 'Bench creation timed out while starting containers. Check the task log for the last completed step and retry.';
    }
    return `Bench creation failed: ${message}`;
  }

  if (message.toLowerCase().includes('already exists')) {
    return `Site creation failed: ${message}`;
  }

  return `Site creation failed: ${message}`;
};
