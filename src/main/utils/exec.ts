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
  env?: NodeJS.ProcessEnv
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    // Merge process.env (which includes the bundled bin/ PATH from main.ts)
    // with any additional env vars. Use shell: false to avoid zsh profile
    // resetting PATH and losing our bundled binaries.
    const mergedEnv = { ...process.env, ...env };

    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: mergedEnv,
    });

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

    child.on('error', reject);

    child.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
  });
};
