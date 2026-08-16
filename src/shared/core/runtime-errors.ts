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

  const normalized = message.toLowerCase();

  if (
    normalized.includes('virtualisation is not enabled') ||
    normalized.includes('virtualization is not enabled') ||
    normalized.includes('hcs_e_hyperv_not_installed') ||
    normalized.includes('virtual machine platform') ||
    normalized.includes('enablevirtualization') ||
    normalized.includes('hardware virtualization')
  ) {
    const prefix = resource === 'bench' ? 'Bench creation failed' : 'Site creation failed';
    return `${prefix}: Hardware virtualization is not enabled on your computer. Please enable "Virtual Machine Platform" in Windows Features and turn on Virtualization (VT-x / AMD-V / SVM) in your BIOS settings.`;
  }

  if (
    normalized.includes('the windows subsystem for linux is not installed') ||
    normalized.includes('wsl is not installed') ||
    normalized.includes('wsl2 (windows subsystem for linux) is not installed') ||
    (normalized.includes('wsl') && (normalized.includes('not installed') || normalized.includes('has no installed distributions')))
  ) {
    const prefix = resource === 'bench' ? 'Bench creation failed' : 'Site creation failed';
    return `${prefix}: Windows Subsystem for Linux (WSL2) is not installed or initialized on your computer. Please open PowerShell as Administrator, run "wsl --install", and restart your PC.`;
  }

  if (resource === 'bench') {
    if (message.toLowerCase().includes('timed out')) {
      const normalized = message.toLowerCase();

      if (
        normalized.includes('podman machine') ||
        normalized.includes('checking bundled podman') ||
        normalized.includes('initializing podman')
      ) {
        return `Bench creation failed during Podman setup: ${message}`;
      }

      if (normalized.includes('bench get-app') || normalized.includes('bench build --app')) {
        return 'Bench creation timed out while installing selected apps. This usually means dependency install or asset build is still running. Check the task log and retry.';
      }

      if (normalized.includes(' pull')) {
        return 'Bench creation timed out while pulling images. Check network/runtime health and retry.';
      }

      return 'Bench creation timed out while starting containers. Check the task log for the last completed step and retry.';
    }
    return `Bench creation failed: ${message}`;
  }

  if (message.toLowerCase().includes('already exists')) {
    return `Site creation failed: ${message}`;
  }

  return `Site creation failed: ${message}`;
};
