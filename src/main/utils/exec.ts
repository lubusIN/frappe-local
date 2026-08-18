import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getActiveTaskSignal } from '@frappe-local/main/services';

import { getBinaryPath } from './binaries';

export const getEnhancedProcessPath = (baseEnv?: NodeJS.ProcessEnv): string => {
  const currentPath = baseEnv?.PATH || process.env.PATH || '';
  const extraDirs: string[] = [];

  try {
    const podmanBinDir = path.dirname(getBinaryPath('podman'));
    if (podmanBinDir) {
      extraDirs.push(podmanBinDir);
    }
  } catch {
    // Ignore if app module not ready in test
  }

  if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    extraDirs.push(
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin',
      '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin',
      path.join(home, 'Applications/Visual Studio Code.app/Contents/Resources/app/bin'),
      path.join(home, '.local/bin')
    );
  }

  const pathParts = new Set(currentPath.split(path.delimiter).filter(Boolean));
  for (const dir of extraDirs) {
    if (fs.existsSync(dir)) {
      pathParts.add(dir);
    }
  }
  return Array.from(pathParts).join(path.delimiter);
};

export const resolveEditorCommand = (commandName: string): { command: string; env: NodeJS.ProcessEnv } => {
  const cmd = commandName.trim() || 'code';
  const enhancedPath = getEnhancedProcessPath();
  const env = { ...process.env, PATH: enhancedPath };

  if (path.isAbsolute(cmd) && fs.existsSync(cmd)) {
    return { command: cmd, env };
  }

  if (cmd === 'code' || cmd === 'code-insiders') {
    const candidates: string[] = [];
    if (process.platform === 'darwin') {
      const home = process.env.HOME || '';
      candidates.push(
        '/usr/local/bin/code',
        '/opt/homebrew/bin/code',
        '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
        '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code',
        path.join(home, 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code')
      );
    } else if (process.platform === 'linux') {
      candidates.push(
        `/usr/bin/${cmd}`,
        `/usr/local/bin/${cmd}`,
        `/snap/bin/${cmd}`,
        `/var/lib/flatpak/exports/bin/com.visualstudio.code`
      );
    } else if (process.platform === 'win32') {
      const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
      const localAppData = process.env['LOCALAPPDATA'] || '';
      const applicationDirectory = cmd === 'code-insiders' ? 'Microsoft VS Code Insiders' : 'Microsoft VS Code';
      const executableName = cmd === 'code-insiders' ? 'Code - Insiders.exe' : 'Code.exe';
      candidates.push(
        path.join(localAppData, 'Programs', applicationDirectory, executableName),
        path.join(progFiles, applicationDirectory, executableName),
        path.join(localAppData, 'Programs', applicationDirectory, 'bin', `${cmd}.cmd`),
        path.join(progFiles, applicationDirectory, 'bin', `${cmd}.cmd`)
      );
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { command: candidate, env };
      }
    }
  }

  return { command: cmd, env };
};

export const createDevContainerFolderUri = (
  hostPath: string,
  workspaceFolder: string,
  platform: NodeJS.Platform = process.platform
): string => {
  const remotePath = workspaceFolder.startsWith('/') ? workspaceFolder : `/${workspaceFolder}`;
  const configPath = path.join(hostPath, '.devcontainer', 'devcontainer.json');
  let configUriPath = configPath.replace(/\\/g, '/');
  if (platform === 'win32' && /^[a-z]:\//i.test(configUriPath)) {
    configUriPath = `/${configUriPath}`;
  }

  const authority = Buffer.from(JSON.stringify({
    hostPath,
    localDocker: true,
    configFile: {
      $mid: 1,
      path: configUriPath,
      scheme: 'file',
    },
  }), 'utf8').toString('hex');
  return `vscode-remote://dev-container+${authority}${encodeURI(remotePath)}`;
};

export const isEditorInstalled = (commandName = 'code'): boolean => {
  const { command, env } = resolveEditorCommand(commandName);
  if (path.isAbsolute(command)) {
    return fs.existsSync(command);
  }

  const pathDirs = (env.PATH || process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, `${command}${ext}`);
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }
  }

  return false;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type ExecOptions = {
  idleTimeout?: number;
  maxTimeout?: number;
  signal?: AbortSignal | null;
};

export const execPromise = (
  command: string,
  args: string[],
  cwd?: string,
  onOutput?: (data: string) => void,
  env?: NodeJS.ProcessEnv,
  timeoutConfig?: ExecOptions
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const enhancedPath = getEnhancedProcessPath(env);
    const mergedEnv = { ...process.env, ...env, PATH: enhancedPath };
    const abortSignal = timeoutConfig?.signal === null
      ? undefined
      : timeoutConfig?.signal ?? getActiveTaskSignal();

    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: mergedEnv,
      detached: process.platform !== 'win32',
    });

    onOutput?.(`$ ${command} ${args.join(' ')}\n`);

    let idleTimer: NodeJS.Timeout | null = null;
    let maxTimer: NodeJS.Timeout | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;
    let settled = false;

    const outputTail = (): string => {
      const output = `${stdout}\n${stderr}`.trim();
      if (!output) {
        return '';
      }
      return `\nLast output:\n${output.slice(-2000)}`;
    };

    const killChildTree = () => {
      if (child.exitCode !== null || child.killed) return;

      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, 'SIGTERM');
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        child.kill('SIGTERM');
      }

      forceKillTimer = setTimeout(() => {
        if (child.exitCode !== null) return;
        try {
          if (process.platform !== 'win32' && child.pid) {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          child.kill('SIGKILL');
        }
      }, 2000);
      forceKillTimer.unref?.();
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      abortSignal?.removeEventListener('abort', onAbort);
      killChildTree();
      reject(error);
    };

    const clearTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (maxTimer) clearTimeout(maxTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };

    const onAbort = () => {
      rejectOnce(new Error(`Command cancelled: ${command} ${args.join(' ')}`));
    };

    if (abortSignal?.aborted) {
      onAbort();
      return;
    }

    abortSignal?.addEventListener('abort', onAbort, { once: true });

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (timeoutConfig?.idleTimeout && timeoutConfig.idleTimeout > 0) {
        idleTimer = setTimeout(() => {
          rejectOnce(new Error(
            `Command timed out after ${timeoutConfig.idleTimeout}ms of no output: ${command} ${args.join(' ')}${outputTail()}`
          ));
        }, timeoutConfig.idleTimeout);
      }
    };

    if (timeoutConfig?.maxTimeout && timeoutConfig.maxTimeout > 0) {
      maxTimer = setTimeout(() => {
        rejectOnce(new Error(
          `Command timed out after reaching maximum wall clock limit of ${timeoutConfig.maxTimeout}ms: ${command} ${args.join(' ')}${outputTail()}`
        ));
      }, timeoutConfig.maxTimeout);
    }

    resetIdleTimer();

    child.stdout.on('data', (chunk: Buffer) => {
      resetIdleTimer();
      const data = chunk.toString();
      stdout += data;
      try {
        onOutput?.(data);
      } catch (error) {
        rejectOnce(error instanceof Error ? error : new Error(String(error)));
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      resetIdleTimer();
      const data = chunk.toString();
      stderr += data;
      try {
        onOutput?.(data);
      } catch (error) {
        rejectOnce(error instanceof Error ? error : new Error(String(error)));
      }
    });

    child.on('error', (err) => {
      rejectOnce(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimers();
      abortSignal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, code });
    });
  });
};
