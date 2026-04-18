import { describe, expect, it } from 'vitest';
import { evaluateStartupReadiness } from '../src/main/bootstrap';

describe('startup runtime readiness', () => {
  it('returns ok when runtime dependencies are fully ready', async () => {
    const result = await evaluateStartupReadiness({
      getHealthForStartup: async () => ({
        preferredRuntime: 'docker',
        selectedRuntime: 'docker',
        fallbackRuntime: null,
        fallbackApplied: false,
        dependencies: [],
        blockingDependencies: [],
        hasBlockingIssues: false,
      }),
    });

    expect(result).toEqual({ ok: true, warnings: [] });
  });

  it('emits warnings when fallback or blocking dependencies are present', async () => {
    const result = await evaluateStartupReadiness({
      getHealthForStartup: async () => ({
        preferredRuntime: 'docker',
        selectedRuntime: 'podman',
        fallbackRuntime: 'podman',
        fallbackApplied: true,
        dependencies: [],
        blockingDependencies: ['docker-compose'],
        hasBlockingIssues: true,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.warnings).toEqual([
      'Runtime fallback is active: preferred docker, using podman.',
      'Runtime readiness check found blocking dependencies: docker-compose.',
    ]);
  });

  it('converts readiness check errors into non-blocking warnings', async () => {
    const result = await evaluateStartupReadiness({
      getHealthForStartup: async () => {
        throw new Error('command timeout');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.warnings).toEqual([
      'Runtime readiness check could not complete: command timeout.',
    ]);
  });
});