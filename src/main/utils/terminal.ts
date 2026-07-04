import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getBinaryPath } from '@frappe-local/main/utils';
import type { AvailableTerminal } from '@frappe-local/shared/core';

import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const getShellsDir = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || tmpdir();
  const dir = join(home, '.frappe-local', 'shells');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const execAsync = promisify(exec);

export const detectAvailableTerminals = async (): Promise<AvailableTerminal[]> => {
  const terminals: AvailableTerminal[] = [{ id: 'default', name: 'System Default' }];

  if (process.platform === 'darwin') {
    const macApps = [
      { id: 'iTerm', name: 'iTerm2', path: '/Applications/iTerm.app' },
      { id: 'Warp', name: 'Warp', path: '/Applications/Warp.app' },
      { id: 'Alacritty', name: 'Alacritty', path: '/Applications/Alacritty.app' },
      { id: 'kitty', name: 'Kitty', path: '/Applications/kitty.app' },
      { id: 'Ghostty', name: 'Ghostty', path: '/Applications/Ghostty.app' },
      { id: 'WezTerm', name: 'WezTerm', path: '/Applications/WezTerm.app' },
      { id: 'Hyper', name: 'Hyper', path: '/Applications/Hyper.app' },
      { id: 'Tabby', name: 'Tabby', path: '/Applications/Tabby.app' },
    ];
    for (const app of macApps) {
      if (existsSync(app.path) || existsSync(join(process.env.HOME || '', 'Applications', app.path.replace('/Applications/', '')))) {
        terminals.push({ id: app.id, name: app.name });
      }
    }
  } else if (process.platform === 'win32') {
    const winApps = [
      { id: 'wt.exe', name: 'Windows Terminal', checkCmd: 'where wt.exe' },
      { id: 'pwsh.exe', name: 'PowerShell Core', checkCmd: 'where pwsh.exe' },
      { id: 'powershell.exe', name: 'Windows PowerShell', checkCmd: 'where powershell.exe' },
      { id: 'cmd.exe', name: 'Command Prompt', checkCmd: 'where cmd.exe' },
      { id: 'git-bash.exe', name: 'Git Bash', path: 'C:\\Program Files\\Git\\git-bash.exe' },
    ];
    for (const app of winApps) {
      if (app.path && existsSync(app.path)) {
        terminals.push({ id: app.id, name: app.name });
      } else if (app.checkCmd) {
        try {
          await execAsync(app.checkCmd);
          terminals.push({ id: app.id, name: app.name });
        } catch {
          // ignore not found
        }
      }
    }
  } else {
    const linuxApps = [
      { id: 'gnome-terminal', name: 'GNOME Terminal' },
      { id: 'konsole', name: 'Konsole' },
      { id: 'xfce4-terminal', name: 'XFCE Terminal' },
      { id: 'alacritty', name: 'Alacritty' },
      { id: 'kitty', name: 'Kitty' },
      { id: 'wezterm', name: 'WezTerm' },
      { id: 'tilix', name: 'Tilix' },
      { id: 'terminator', name: 'Terminator' },
      { id: 'xterm', name: 'XTerm' },
    ];
    for (const app of linuxApps) {
      try {
        await execAsync(`which ${app.id}`);
        terminals.push({ id: app.id, name: app.name });
      } catch {
        // ignore not found
      }
    }
  }

  return terminals;
};

export const openBenchShell = async (
  benchPath: string,
  projectName: string,
  env: NodeJS.ProcessEnv,
  terminalPreference = 'default'
): Promise<void> => {
  const composePath = getBinaryPath('docker-compose');
  const command = `cd "${benchPath}" && DOCKER_HOST="${env.DOCKER_HOST || ''}" "${composePath}" -p ${projectName} exec frappe /bin/bash`;

  const pref = terminalPreference.trim() || 'default';

  if (process.platform === 'darwin') {
    const scriptPath = join(getShellsDir(), `bench-${projectName}.command`);
    const script = `#!/bin/bash\n# Frappe Local - Bench Shell (${projectName})\n${command}\n`;
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, '755');

    if (pref === 'default' || pref === 'Terminal') {
      const appleScript = `tell application "Terminal"\n  activate\n  do script "${scriptPath}"\nend tell`;
      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
    } else if (pref === 'iTerm' || pref === 'iTerm2') {
      const appleScript = `tell application "iTerm"\n  activate\n  if (count of windows) = 0 then\n    create window with default profile command "${scriptPath}"\n  else\n    tell current window\n      create tab with default profile command "${scriptPath}"\n    end tell\n  end if\nend tell`;
      await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);
    } else if (pref === 'Warp' || pref === 'Alacritty' || pref === 'kitty' || pref === 'Ghostty' || pref === 'WezTerm' || pref === 'Hyper' || pref === 'Tabby') {
      await execAsync(`open -a ${pref} "${scriptPath}"`);
    } else {
      if (pref.startsWith('/') || pref.endsWith('.app')) {
        await execAsync(`open -a "${pref}" "${scriptPath}"`);
      } else {
        await execAsync(`${pref} "${scriptPath}"`);
      }
    }
  } else if (process.platform === 'win32') {
    const scriptPath = join(getShellsDir(), `bench-${projectName}.bat`);
    const script = `@echo off\n:: Frappe Local - Bench Shell (${projectName})\n${command}\n`;
    writeFileSync(scriptPath, script);

    if (pref === 'default' || pref === 'cmd.exe') {
      await execAsync(`start "" "${scriptPath}"`);
    } else if (pref === 'wt.exe' || pref === 'wt') {
      await execAsync(`wt.exe -d "${benchPath}" "${scriptPath}"`);
    } else if (pref === 'pwsh.exe' || pref === 'powershell.exe') {
      await execAsync(`start "" ${pref} -NoExit -Command "${command}"`);
    } else if (pref === 'git-bash.exe' || pref.includes('git-bash')) {
      const gitBashPath = existsSync('C:\\Program Files\\Git\\git-bash.exe')
        ? 'C:\\Program Files\\Git\\git-bash.exe'
        : pref;
      await execAsync(`"${gitBashPath}" -c "${command}"`);
    } else {
      await execAsync(`start "" "${pref}" "${scriptPath}"`);
    }
  } else {
    const scriptPath = join(getShellsDir(), `bench-${projectName}.sh`);
    const script = `#!/bin/bash\n# Frappe Local - Bench Shell (${projectName})\n${command}\n`;
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, '755');

    if (pref === 'default') {
      try {
        await execAsync(`x-terminal-emulator -e "${scriptPath}"`);
      } catch {
        try {
          await execAsync(`gnome-terminal -- "${scriptPath}"`);
        } catch {
          await execAsync(`xterm -e "${scriptPath}"`);
        }
      }
    } else if (pref === 'gnome-terminal') {
      await execAsync(`gnome-terminal -- "${scriptPath}"`);
    } else {
      await execAsync(`${pref} -e "${scriptPath}"`);
    }
  }
};
