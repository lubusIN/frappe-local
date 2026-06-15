import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getBinaryPath } from './binaries';

import { writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

export const openBenchShell = async (benchPath: string, projectName: string, env: NodeJS.ProcessEnv): Promise<void> => {
  const composePath = getBinaryPath('docker-compose');
  const command = `cd "${benchPath}" && DOCKER_HOST="${env.DOCKER_HOST || ''}" "${composePath}" -p ${projectName} exec frappe /bin/bash`;

  if (process.platform === 'darwin') {
    // On macOS, creating a .command file and opening it automatically uses the user's 
    // default terminal (e.g., Terminal or iTerm2) and reliably brings it to focus.
    const scriptPath = join(tmpdir(), `bench-shell-${Date.now()}.command`);
    const script = `#!/bin/bash\n${command}\n`;
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, '755');
    await execAsync(`open "${scriptPath}"`);
  } else if (process.platform === 'win32') {
    // On Windows, creating a .bat file and using start creates a new, focused console window.
    const scriptPath = join(tmpdir(), `bench-shell-${Date.now()}.bat`);
    const script = `@echo off\n${command}\n`;
    writeFileSync(scriptPath, script);
    await execAsync(`start "" "${scriptPath}"`);
  } else {
    // On Linux, we try common terminal emulators in new window modes which natively focus.
    const scriptPath = join(tmpdir(), `bench-shell-${Date.now()}.sh`);
    const script = `#!/bin/bash\n${command}\n`;
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, '755');
    
    try {
      await execAsync(`x-terminal-emulator -e "${scriptPath}"`);
    } catch {
      try {
        await execAsync(`gnome-terminal -- "${scriptPath}"`);
      } catch {
        await execAsync(`xterm -e "${scriptPath}"`);
      }
    }
  }
};
