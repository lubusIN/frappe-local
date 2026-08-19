import { exec, spawn } from 'node:child_process';
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

const launchDetached = async (
  executable: string,
  args: string[],
  cwd?: string
): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.once('error', reject);
  child.once('spawn', () => {
    child.unref();
    resolve();
  });
});

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

const launchShellScript = async (
  scriptName: string,
  scriptComment: string,
  command: string,
  benchPath: string,
  terminalPreference = 'default'
): Promise<void> => {
  const pref = terminalPreference.trim() || 'default';

  if (process.platform === 'darwin') {
    const scriptPath = join(getShellsDir(), `${scriptName}.command`);
    const script = `#!/bin/bash\n# ${scriptComment}\n${command}\n`;
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, '755');

    if (pref === 'default' || pref === 'Terminal') {
      await execAsync(`open -a Terminal "${scriptPath}"`);
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
    const scriptPath = join(getShellsDir(), `${scriptName}.bat`);
    const script = `@echo off\r\n:: ${scriptComment}\r\n${command}\r\n`;
    writeFileSync(scriptPath, script);

    if (pref === 'default' || pref === 'cmd.exe') {
      await launchDetached('cmd.exe', ['/d', '/k', 'call', scriptPath], benchPath);
    } else if (pref === 'wt.exe' || pref === 'wt') {
      await launchDetached('wt.exe', ['-d', benchPath, 'cmd.exe', '/d', '/k', 'call', scriptPath], benchPath);
    } else if (pref === 'pwsh.exe' || pref === 'powershell.exe') {
      const escapedScriptPath = scriptPath.replace(/'/g, "''");
      await launchDetached(pref, ['-NoExit', '-Command', `& '${escapedScriptPath}'`], benchPath);
    } else if (pref === 'git-bash.exe' || pref.includes('git-bash')) {
      const gitBashPath = existsSync('C:\\Program Files\\Git\\git-bash.exe')
        ? 'C:\\Program Files\\Git\\git-bash.exe'
        : pref;
      const escapedScriptPath = scriptPath.replace(/'/g, "'\\''");
      await launchDetached(gitBashPath, ['-c', `exec cmd.exe /d /k call '${escapedScriptPath}'`], benchPath);
    } else {
      await launchDetached(pref, [scriptPath], benchPath);
    }
  } else {
    const scriptPath = join(getShellsDir(), `${scriptName}.sh`);
    const script = `#!/bin/bash\n# ${scriptComment}\n${command}\n`;
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

const launchContainerShell = async (
  benchPath: string,
  projectName: string,
  env: NodeJS.ProcessEnv,
  terminalPreference: string,
  siteName?: string
): Promise<void> => {
  const composePath = getBinaryPath('docker-compose');
  let command: string;
  if (process.platform === 'win32') {
    const escapeBatchValue = (value: string): string => value.replace(/%/g, '%%').replace(/"/g, '""');
    const siteArg = siteName ? ` -e "FRAPPE_SITE=${escapeBatchValue(siteName)}"` : '';
    const containerName = `${escapeBatchValue(projectName)}-frappe-1`;
    command = [
      `cd /d "${escapeBatchValue(benchPath)}"`,
      // Keep interactive shells off the Docker-compatible API used by VS Code.
      // Podman's native WSL client supports concurrent TTY attaches reliably.
      `wsl.exe -d podman-frappe-local -u user -- /usr/local/bin/enterns /usr/bin/env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/podman exec -it${siteArg} "${containerName}" /bin/bash`,
    ].join('\r\n');
  } else {
    const envArg = siteName ? `-e FRAPPE_SITE="${siteName}" ` : '';
    command = `cd "${benchPath}" && DOCKER_HOST="${env.DOCKER_HOST || ''}" "${composePath}" -p ${projectName} exec ${envArg}frappe /bin/bash`;
  }

  const scriptName = siteName ? `site-${siteName}-${projectName}` : `bench-${projectName}`;
  const scriptComment = siteName ? `Frappe Local - Site Shell (${siteName})` : `Frappe Local - Bench Shell (${projectName})`;

  await launchShellScript(scriptName, scriptComment, command, benchPath, terminalPreference);
};

export const openSiteShell = (
  benchPath: string,
  projectName: string,
  siteName: string,
  env: NodeJS.ProcessEnv,
  terminalPreference = 'default'
): Promise<void> => launchContainerShell(benchPath, projectName, env, terminalPreference, siteName);

export const openBenchShell = (
  benchPath: string,
  projectName: string,
  env: NodeJS.ProcessEnv,
  terminalPreference = 'default'
): Promise<void> => launchContainerShell(benchPath, projectName, env, terminalPreference);
