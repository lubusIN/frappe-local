import { spawn } from 'node:child_process';
import { getActiveTaskSignal } from '../services/task-runner';

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

    const mergedEnv = { ...process.env, ...env };
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
