import path from 'node:path';
import { app } from 'electron';

/**
 * Get the absolute path to a bundled binary.
 * This handles both development (using the project's bin/ folder)
 * and production (using the Electron resources/bin folder).
 */
export function getBinaryPath(name: string): string {
  // In development, the bin folder is at the project root
  const devPath = path.join(app.getAppPath(), 'bin', name);
  
  // In production, Electron forge usually puts extra resources in the resources path
  const prodPath = path.join(process.resourcesPath, 'bin', name);
  
  // Return prod path if packaged, otherwise dev path
  return app.isPackaged ? prodPath : devPath;
}
