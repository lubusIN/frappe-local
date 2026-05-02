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
  onOutput?: (data: string) => void
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn(command, args, { cwd, shell: true });

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
