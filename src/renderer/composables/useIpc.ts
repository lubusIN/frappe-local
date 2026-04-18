import type { RendererBridge } from '../../shared/ipc';

/**
 * Returns the IPC bridge exposed by the preload script.
 * Throws if called outside the Electron renderer context (e.g., in tests without preload).
 */
export const useIpc = (): RendererBridge => {
  const bridge = (window as Window & { frappeCafe?: RendererBridge }).frappeCafe;
  if (!bridge) {
    throw new Error('IPC bridge is unavailable. Ensure the preload script is loaded.');
  }
  return bridge;
};
