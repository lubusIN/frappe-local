import { describe, expect, it } from 'vitest';
import { execPromise } from '../../../src/main/utils/exec';
import { TaskRunner } from '../../../src/main/services/task-runner';

const waitFor = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('execPromise', () => {
  it('terminates a running command when its abort signal fires', async () => {
    const controller = new AbortController();
    const command = execPromise(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      undefined,
      undefined,
      undefined,
      {
        maxTimeout: 10_000,
        signal: controller.signal,
      }
    );

    setTimeout(() => controller.abort(), 25);

    await expect(command).rejects.toThrow('Command cancelled');
  });

  it('allows cleanup commands to run after task cancellation', async () => {
    const runner = new TaskRunner();
    let cleanupCompleted = false;

    const taskId = runner.enqueue({
      name: 'Cancelable command with cleanup',
      run: async () => {
        try {
          await execPromise(
            process.execPath,
            ['-e', 'setInterval(() => {}, 1000)'],
            undefined,
            undefined,
            undefined,
            { maxTimeout: 10_000 }
          );
        } finally {
          const cleanup = await execPromise(
            process.execPath,
            ['-e', 'process.stdout.write("clean")'],
            undefined,
            undefined,
            undefined,
            { maxTimeout: 2000, signal: null }
          );
          cleanupCompleted = cleanup.stdout === 'clean';
        }
      },
    });

    await waitFor(() => runner.getTask(taskId)?.status === 'running');
    expect(runner.cancelTask(taskId)).toBe(true);
    await waitFor(() => runner.getTask(taskId)?.status === 'failure');

    expect(cleanupCompleted).toBe(true);
  });
});
