import { spawn } from 'node:child_process';

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export const execPromise = (
  command: string,
  args: string[],
  cwd?: string,
  onOutput?: (data: string) => void,
  env?: NodeJS.ProcessEnv,
  timeoutConfig?: { idleTimeout?: number; maxTimeout?: number }
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const mergedEnv = { ...process.env, ...env };

    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: mergedEnv,
    });

    onOutput?.(`$ ${command} ${args.join(' ')}\n`);

    let idleTimer: NodeJS.Timeout | null = null;
    let maxTimer: NodeJS.Timeout | null = null;
    let settled = false;

    const outputTail = (): string => {
      const output = `${stdout}\n${stderr}`.trim();
      if (!output) {
        return '';
      }
      return `\nLast output:\n${output.slice(-2000)}`;
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      child.kill();
      reject(error);
    };

    const clearTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (maxTimer) clearTimeout(maxTimer);
    };

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
      onOutput?.(data);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      resetIdleTimer();
      const data = chunk.toString();
      stderr += data;
      onOutput?.(data);
    });

    child.on('error', (err) => {
      rejectOnce(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({ stdout, stderr, code });
    });
  });
};
