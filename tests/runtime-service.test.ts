import { describe, expect, it } from 'vitest';
import { RuntimeService, resolveRuntimeSelection } from '../src/main/runtime-service';
import { TaskRunner } from '../src/main/task-runner';
import type { TaskProgressEvent } from '../src/shared/domain/task-runner';
import type { DependencyAggregateHealth } from '../src/main/runtime-detector';

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const createHealthAggregate = (
  entries: Array<{
    dependency: 'podman' | 'docker-compose' | 'git';
    status: 'ready' | 'missing' | 'incompatible' | 'unknown';
    version?: string | null;
  }>
): DependencyAggregateHealth => ({
  dependencies: entries.map((entry) => ({
    errorCode: entry.status === 'ready' ? null : 'not-found',
    health: {
      dependency: entry.dependency,
      status: entry.status,
      detectedVersion: entry.version ?? null,
      requiredVersion: '1.0.0',
      summary: `${entry.dependency} is ${entry.status}.`,
      guidance: {
        title: `Repair ${entry.dependency}`,
        steps: ['Follow the remediation guidance.'],
      },
    },
  })),
  hasBlockingIssues: entries.some((entry) => entry.status !== 'ready'),
});

describe('runtime service', () => {
  it('falls back to the alternate runtime when the preferred runtime is blocked', () => {
    const selection = resolveRuntimeSelection('docker', [
      {
        dependency: 'docker-compose',
        status: 'missing',
        detectedVersion: null,
        requiredVersion: '2.20.0',
        summary: 'missing',
        guidance: { title: 'Repair docker-compose', steps: ['Install it.'] },
      },
      {
        dependency: 'podman',
        status: 'ready',
        detectedVersion: '4.5.1',
        requiredVersion: '4.0.0',
        summary: 'ready',
        guidance: { title: 'Ready', steps: ['No action required.'] },
      },
      {
        dependency: 'git',
        status: 'ready',
        detectedVersion: '2.40.1',
        requiredVersion: '2.39.0',
        summary: 'ready',
        guidance: { title: 'Ready', steps: ['No action required.'] },
      },
    ]);

    expect(selection).toMatchObject({
      preferredRuntime: 'docker',
      selectedRuntime: 'podman',
      fallbackRuntime: 'podman',
      fallbackApplied: true,
      hasBlockingIssues: false,
      blockingDependencies: ['docker-compose'],
    });
  });

  it('enqueues repair steps and re-validates readiness in dry-run mode', async () => {
    const taskRunner = new TaskRunner();
    const events: TaskProgressEvent[] = [];
    let detectCallCount = 0;

    taskRunner.onEvent((event) => {
      events.push(event);
    });

    const service = new RuntimeService({
      settings: {
        get: async () => ({
          defaultFrappeVersion: '15.0.0',
          runtimePreference: 'docker',
          storagePath: '/tmp/frappe-cafe',
          terminalPreference: 'zsh',
          editorPreference: 'code',
          updateChannel: 'stable',
          autoUpdateEnabled: true,
          sidebarCompact: false,
        }),
      },
      taskRunner,
      detectDependencies: async () => {
        detectCallCount += 1;
        return detectCallCount === 1
          ? createHealthAggregate([
              { dependency: 'docker-compose', status: 'missing' },
              { dependency: 'podman', status: 'ready', version: '4.5.1' },
              { dependency: 'git', status: 'ready', version: '2.40.1' },
            ])
          : createHealthAggregate([
              { dependency: 'docker-compose', status: 'ready', version: '2.24.6' },
              { dependency: 'podman', status: 'ready', version: '4.5.1' },
              { dependency: 'git', status: 'ready', version: '2.40.1' },
            ]);
      },
      repairAdapters: {
        'docker-compose': {
          repair: async ({ dryRun }) => ({
            summary: dryRun ? 'docker-compose repair simulated.' : 'docker-compose repaired.',
          }),
        },
      },
    });

    const repair = await service.startRepair({ runtimePreference: 'docker', dryRun: true });
    await flushPromises();
    await flushPromises();

    expect(repair).toMatchObject({
      preferredRuntime: 'docker',
      selectedRuntime: 'podman',
      fallbackApplied: true,
      dryRun: true,
      repairDependencies: ['docker-compose'],
    });
    expect(events.map((event) => event.type)).toEqual([
      'task.started',
      'task.log',
      'task.step.started',
      'task.log',
      'task.step.completed',
      'task.step.started',
      'task.step.completed',
      'task.completed',
    ]);
  });

  it('logs rollback intent when a repair step fails', async () => {
    const taskRunner = new TaskRunner();
    const events: TaskProgressEvent[] = [];

    taskRunner.onEvent((event) => {
      events.push(event);
    });

    const service = new RuntimeService({
      settings: {
        get: async () => ({
          defaultFrappeVersion: '15.0.0',
          runtimePreference: 'podman',
          storagePath: '/tmp/frappe-cafe',
          terminalPreference: 'zsh',
          editorPreference: 'code',
          updateChannel: 'stable',
          autoUpdateEnabled: true,
          sidebarCompact: false,
        }),
      },
      taskRunner,
      detectDependencies: async () => createHealthAggregate([
        { dependency: 'docker-compose', status: 'ready', version: '2.24.6' },
        { dependency: 'podman', status: 'missing' },
        { dependency: 'git', status: 'ready', version: '2.40.1' },
      ]),
      repairAdapters: {
        podman: {
          repair: async () => {
            throw new Error('Podman installation failed.');
          },
        },
      },
    });

    await service.startRepair({ runtimePreference: 'podman', dryRun: false });
    await flushPromises();
    await flushPromises();

    expect(events.map((event) => event.type)).toEqual([
      'task.started',
      'task.log',
      'task.step.started',
      'task.log',
      'task.failed',
    ]);
    expect(events[3]).toMatchObject({
      type: 'task.log',
      logLevel: 'warning',
      message: 'Rollback is not available for dependency repair operations.',
    });
    expect(events[4]).toMatchObject({
      type: 'task.failed',
      message: 'Podman installation failed.',
    });
  });

  it('reuses in-flight checks and invalidates stale health snapshots', async () => {
    const taskRunner = new TaskRunner();
    let detectCallCount = 0;

    const service = new RuntimeService({
      settings: {
        get: async () => ({
          defaultFrappeVersion: '15.0.0',
          runtimePreference: 'docker',
          storagePath: '/tmp/frappe-cafe',
          terminalPreference: 'zsh',
          editorPreference: 'code',
          updateChannel: 'stable',
          autoUpdateEnabled: true,
          sidebarCompact: false,
        }),
      },
      taskRunner,
      checkDebounceMs: 5000,
      staleAfterMs: 20,
      detectDependencies: async () => {
        detectCallCount += 1;
        await flushPromises();
        return createHealthAggregate([
          { dependency: 'docker-compose', status: 'ready', version: '2.24.6' },
          { dependency: 'podman', status: 'ready', version: '4.5.1' },
          { dependency: 'git', status: 'ready', version: '2.40.1' },
        ]);
      },
    });

    const [first, second] = await Promise.all([service.getHealth(), service.getHealth()]);
    expect(first.selectedRuntime).toBe('docker');
    expect(second.selectedRuntime).toBe('docker');
    expect(detectCallCount).toBe(1);

    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    await service.getHealth();
    expect(detectCallCount).toBe(2);

    service.invalidateHealthCache();
    await service.getHealth();
    expect(detectCallCount).toBe(3);
  });

  it('forces fresh startup health checks by invalidating cache after evaluation', async () => {
    const taskRunner = new TaskRunner();
    let detectCallCount = 0;

    const service = new RuntimeService({
      settings: {
        get: async () => ({
          defaultFrappeVersion: '15.0.0',
          runtimePreference: 'docker',
          storagePath: '/tmp/frappe-cafe',
          terminalPreference: 'zsh',
          editorPreference: 'code',
          updateChannel: 'stable',
          autoUpdateEnabled: true,
          sidebarCompact: false,
        }),
      },
      taskRunner,
      staleAfterMs: 5000,
      detectDependencies: async () => {
        detectCallCount += 1;
        return createHealthAggregate([
          { dependency: 'docker-compose', status: 'ready', version: '2.24.6' },
          { dependency: 'podman', status: 'ready', version: '4.5.1' },
          { dependency: 'git', status: 'ready', version: '2.40.1' },
        ]);
      },
    });

    await service.getHealth();
    expect(detectCallCount).toBe(1);

    await service.getHealthForStartup();
    expect(detectCallCount).toBe(1);

    await service.getHealth();
    expect(detectCallCount).toBe(2);
  });
});