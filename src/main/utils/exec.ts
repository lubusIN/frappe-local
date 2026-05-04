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
  timeout = 0
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

    let timeoutId: NodeJS.Timeout | null = null;
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`));
      }, timeout);
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      stdout += data;
      onOutput?.(data);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      stderr += data;
      onOutput?.(data);
    });

    child.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ stdout, stderr, code });
    });
  });
};
