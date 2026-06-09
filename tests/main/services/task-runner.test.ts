import { describe, expect, it } from 'vitest';
import { TaskRunner } from '../../../src/main/services/task-runner';
import type { TaskProgressEvent } from '../../../src/shared/domain/task-runner';

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const createDeferred = () => {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
};

describe('TaskRunner', () => {
  it('runs tasks serially and emits ordered lifecycle events', async () => {
    const runner = new TaskRunner();
    const events: TaskProgressEvent[] = [];
    const firstGate = createDeferred();

    runner.onEvent((event) => {
      events.push(event);
    });

    const firstTaskId = runner.enqueue({
      name: 'First task',
      run: async (context) => {
        context.startStep('prepare', 'Prepare environment');
        await firstGate.promise;
        context.completeStep('prepare', 'Prepare environment');
      },
    });

    const secondTaskId = runner.enqueue({
      name: 'Second task',
      run: async (context) => {
        context.startStep('verify', 'Verify runtime');
        context.completeStep('verify', 'Verify runtime');
      },
    });

    await flushPromises();
    expect(runner.getTask(firstTaskId)?.status).toBe('running');
    expect(runner.getTask(secondTaskId)?.status).toBe('queued');

    firstGate.resolve();
    await flushPromises();
    await flushPromises();

    expect(runner.getTask(firstTaskId)?.status).toBe('success');
    expect(runner.getTask(secondTaskId)?.status).toBe('success');
    expect(events.map((event) => `${event.taskName}:${event.type}`)).toEqual([
      'First task:task.queued',
      'First task:task.started',
      'First task:task.step.started',
      'Second task:task.queued',
      'First task:task.step.completed',
      'First task:task.completed',
      'Second task:task.started',
      'Second task:task.step.started',
      'Second task:task.step.completed',
      'Second task:task.completed',
    ]);
  });

  it('cancels queued tasks without starting them', async () => {
    const runner = new TaskRunner();
    const events: TaskProgressEvent[] = [];
    const firstGate = createDeferred();

    runner.onEvent((event) => {
      events.push(event);
    });

    runner.enqueue({
      name: 'Blocking task',
      run: async (context) => {
        context.startStep('hold', 'Hold queue');
        await firstGate.promise;
        context.completeStep('hold', 'Hold queue');
      },
    });

    const cancelledTaskId = runner.enqueue({
      name: 'Cancelled task',
      run: async () => undefined,
    });

    expect(runner.cancelTask(cancelledTaskId)).toBe(true);
    firstGate.resolve();
    await flushPromises();
    await flushPromises();

    const cancelledEvents = events.filter((event) => event.taskId === cancelledTaskId);
    expect(cancelledEvents).toHaveLength(2);
    expect(cancelledEvents[0]).toMatchObject({
      type: 'task.queued',
      status: 'queued',
    });
    expect(cancelledEvents[1]).toMatchObject({
      type: 'task.failed',
      status: 'failure',
      errorCode: 'cancelled',
    });
  });

  it('transitions running tasks into failure when they are cancelled', async () => {
    const runner = new TaskRunner();
    const events: TaskProgressEvent[] = [];
    const gate = createDeferred();

    runner.onEvent((event) => {
      events.push(event);
    });

    const taskId = runner.enqueue({
      name: 'Cancelable task',
      run: async (context) => {
        context.startStep('wait', 'Wait for cancellation');
        await gate.promise;
        context.throwIfCancelled();
      },
    });

    await flushPromises();
    expect(runner.cancelTask(taskId)).toBe(true);
    gate.resolve();
    await flushPromises();
    await flushPromises();

    const taskEvents = events.filter((event) => event.taskId === taskId);
    expect(taskEvents.map((event) => event.type)).toEqual([
      'task.queued',
      'task.started',
      'task.step.started',
      'task.failed',
    ]);
    expect(runner.getTask(taskId)?.status).toBe('failure');
    expect(taskEvents[3]).toMatchObject({
      errorCode: 'cancelled',
      status: 'failure',
    });
  });

  it('emits task logs and failure transitions deterministically', async () => {
    const runner = new TaskRunner();
    const events: TaskProgressEvent[] = [];

    runner.onEvent((event) => {
      events.push(event);
    });

    runner.enqueue({
      name: 'Failure task',
      run: async (context) => {
        context.startStep('probe', 'Probe dependency');
        context.log('warning', 'Probe is taking longer than expected.');
        throw new Error('Probe command failed.');
      },
    });

    await flushPromises();
    await flushPromises();

    expect(events.map((event) => event.type)).toEqual([
      'task.queued',
      'task.started',
      'task.step.started',
      'task.log',
      'task.failed',
    ]);
    expect(events[3]).toMatchObject({
      logLevel: 'warning',
      message: 'Probe is taking longer than expected.',
    });
    expect(events[4]).toMatchObject({
      message: 'Probe command failed.',
      errorCode: 'task-failed',
    });
  });

  it('preserves resource metadata on task completion events', async () => {
    const runner = new TaskRunner();
    const events: TaskProgressEvent[] = [];

    runner.onEvent((event) => {
      events.push(event);
    });

    runner.enqueue({
      name: 'Update Site Apps alpha.localhost',
      resource: { type: 'site', id: 'site-123' },
      run: async (context) => {
        context.startStep('apps', 'Updating site apps');
        context.completeStep('apps', 'Site apps updated');
      },
    });

    await flushPromises();
    await flushPromises();

    const completedEvent = events.find((event) => event.type === 'task.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.resource).toEqual({ type: 'site', id: 'site-123' });
  });
});
