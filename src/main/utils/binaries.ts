import path from 'node:path';
import { app } from 'electron';

/**
 * Get the absolute path to a bundled binary.
 * This handles both development (using the project's bin/ folder)
 * and production (using the Electron resources/bin folder).
 */
export function getBinaryPath(name: string): string {
  const isWindows = process.platform === 'win32';
  const hasExtension = path.extname(name) !== '';
  const binaryName = isWindows && !hasExtension ? `${name}.exe` : name;

  // In development, the bin folder is at the project root
  const devPath = path.join(app.getAppPath(), 'bin', binaryName);
  
  // In production, Electron forge usually puts extra resources in the resources path
  const prodPath = process.resourcesPath ? path.join(process.resourcesPath, 'bin', binaryName) : devPath;
  
  // Return prod path if packaged, otherwise dev path
  return app.isPackaged ? prodPath : devPath;
}
