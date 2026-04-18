import { describe, expect, it, vi } from 'vitest';
import { detectAllDependencies, detectDependency, type CommandRunner } from '../src/main/runtime-detector';

describe('runtime detector', () => {
  it('detects a ready dependency when the command returns a supported version', async () => {
    const runner: CommandRunner = vi.fn(async () => ({
      stdout: 'git version 2.40.1',
      stderr: '',
      exitCode: 0,
    }));

    const result = await detectDependency('git', runner);

    expect(result.health.status).toBe('ready');
    expect(result.errorCode).toBeNull();
    expect(result.health.detectedVersion).toBe('2.40.1');
  });

  it('reports missing dependencies when all probe commands are unavailable', async () => {
    const runner: CommandRunner = vi.fn(async () => {
      const error = new Error('command not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    });

    const result = await detectDependency('podman', runner);

    expect(result.health.status).toBe('missing');
    expect(result.errorCode).toBe('not-found');
  });

  it('maps permission failures to unknown status with actionable error code', async () => {
    const runner: CommandRunner = vi.fn(async () => {
      const error = new Error('permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      throw error;
    });

    const result = await detectDependency('git', runner);

    expect(result.health.status).toBe('unknown');
    expect(result.errorCode).toBe('permission-denied');
  });

  it('flags incompatible versions explicitly', async () => {
    const runner: CommandRunner = vi.fn(async () => ({
      stdout: 'podman version 3.4.2',
      stderr: '',
      exitCode: 0,
    }));

    const result = await detectDependency('podman', runner);

    expect(result.health.status).toBe('incompatible');
    expect(result.errorCode).toBe('unsupported-version');
  });

  it('maps timeouts into the error taxonomy', async () => {
    const runner: CommandRunner = vi.fn(async () => {
      const error = new Error('Command timed out') as NodeJS.ErrnoException;
      error.code = 'ETIMEDOUT';
      throw error;
    });

    const result = await detectDependency('git', runner);

    expect(result.health.status).toBe('unknown');
    expect(result.errorCode).toBe('execution-timeout');
  });

  it('aggregates multi-dependency health output', async () => {
    const runner: CommandRunner = vi
      .fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: 'podman version 4.5.1', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'Docker Compose version v2.24.6', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'git version 2.40.1', stderr: '', exitCode: 0 });

    const aggregate = await detectAllDependencies(runner);

    expect(aggregate.dependencies).toHaveLength(3);
    expect(aggregate.hasBlockingIssues).toBe(false);
    expect(aggregate.dependencies.every((entry) => entry.health.status === 'ready')).toBe(true);
  });
});