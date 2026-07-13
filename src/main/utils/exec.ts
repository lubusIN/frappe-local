import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getActiveTaskSignal } from '@frappe-local/main/services';

export const getEnhancedProcessPath = (baseEnv?: NodeJS.ProcessEnv): string => {
  const currentPath = baseEnv?.PATH || process.env.PATH || '';
  if (process.platform !== 'darwin') {
    return currentPath;
  }
  const home = process.env.HOME || '';
  const extraDirs = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin',
    '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin',
    path.join(home, 'Applications/Visual Studio Code.app/Contents/Resources/app/bin'),
    path.join(home, '.local/bin')
  ];

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
      candidates.push(
        path.join(progFiles, 'Microsoft VS Code\\bin\\code.cmd'),
        path.join(progFiles, 'Microsoft VS Code\\bin\\code.exe'),
        path.join(localAppData, 'Programs\\Microsoft VS Code\\bin\\code.cmd'),
        path.join(localAppData, 'Programs\\Microsoft VS Code\\bin\\code.exe')
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
