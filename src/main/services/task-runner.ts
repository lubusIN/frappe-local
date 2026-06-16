import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import type {
  TaskProgressEvent,
  TaskSnapshot,
  TaskLogLevel,
  TaskResourceContext,
} from '../../shared/domain/task-runner';

type ManagedTask = {
  readonly id: string;
  readonly name: string;
  readonly resource: TaskResourceContext | null;
  readonly run: (context: TaskExecutionContext) => Promise<void>;
  readonly controller: AbortController;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly status: TaskSnapshot['status'];
  readonly currentStepId: string | null;
  readonly currentStepName: string | null;
};

export type TaskExecutionContext = {
  readonly taskId: string;
  readonly signal: AbortSignal;
  startStep: (stepId: string, stepName: string, message?: string) => void;
  completeStep: (stepId: string, stepName: string, message?: string) => void;
  log: (level: TaskLogLevel, message: string, stepId?: string, stepName?: string) => void;
  throwIfCancelled: () => void;
};

export type TaskDefinition = {
  readonly id?: string;
  readonly name: string;
  readonly resource?: TaskResourceContext;
  readonly run: (context: TaskExecutionContext) => Promise<void>;
};

type TaskRunnerListener = (event: TaskProgressEvent) => void;

const cancellationErrorCode = 'cancelled';
const taskSignalStorage = new AsyncLocalStorage<AbortSignal>();
const LOG_EVENT_EMIT_INTERVAL_MS = 250;
const LOG_EVENT_EMIT_MAX_BURST = 40;

export const getActiveTaskSignal = (): AbortSignal | undefined => taskSignalStorage.getStore();

const now = (): string => new Date().toISOString();

const toSnapshot = (task: ManagedTask): TaskSnapshot => ({
  id: task.id,
  name: task.name,
  status: task.status,
  createdAt: task.createdAt,
  startedAt: task.startedAt,
  completedAt: task.completedAt,
  currentStepId: task.currentStepId,
  currentStepName: task.currentStepName,
});

export class TaskRunner {
  private readonly listeners = new Set<TaskRunnerListener>();
  private readonly tasks = new Map<string, ManagedTask>();
  private readonly queue: string[] = [];
  private readonly logEmitState = new Map<string, { lastEmittedAt: number; burstCount: number }>();
  private activeTaskId: string | null = null;
  private logDirectory: string | null = null;

  public configureLogDirectory(logDirectory: string | null): void {
    this.logDirectory = logDirectory;
  }

  public onEvent(listener: TaskRunnerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public enqueue(definition: TaskDefinition): string {
    const taskId = definition.id ?? `task-${randomUUID()}`;
    const task: ManagedTask = {
      id: taskId,
      name: definition.name,
      resource: definition.resource ?? null,
      run: definition.run,
      controller: new AbortController(),
      createdAt: now(),
      startedAt: null,
      completedAt: null,
      status: 'queued',
      currentStepId: null,
      currentStepName: null,
    };

    this.tasks.set(taskId, task);
    this.queue.push(taskId);

    this.emit({
      taskId,
      taskName: task.name,
      ...(task.resource ? { resource: task.resource } : {}),
      type: 'task.queued',
      status: 'queued',
      stepId: null,
      stepName: null,
      message: `${task.name} was queued for execution.`,
      timestamp: task.createdAt,
      logLevel: null,
      errorCode: null,
    });

    void this.startNext();
    return taskId;
  }

  public cancelTask(taskId: string): boolean {
    const queuedIndex = this.queue.indexOf(taskId);
    if (queuedIndex >= 0 && this.activeTaskId !== taskId) {
      this.queue.splice(queuedIndex, 1);
      const task = this.tasks.get(taskId);
      if (!task) {
        return false;
      }

      this.finishTask(taskId, 'failure', 'Task was cancelled before it started.', null, cancellationErrorCode);
      return true;
    }

    const task = this.tasks.get(taskId);
    if (!task || this.activeTaskId !== taskId) {
      return false;
    }

    task.controller.abort();
    return true;
  }

  public getTask(taskId: string): TaskSnapshot | null {
    const task = this.tasks.get(taskId);
    return task ? toSnapshot(task) : null;
  }

  public listTasks(): readonly TaskSnapshot[] {
    return Array.from(this.tasks.values(), toSnapshot);
  }

  private async startNext(): Promise<void> {
    if (this.activeTaskId !== null) {
      return;
    }

    const nextTaskId = this.queue.shift();
    if (!nextTaskId) {
      return;
    }

    const task = this.tasks.get(nextTaskId);
    if (!task) {
      void this.startNext();
      return;
    }

    this.activeTaskId = nextTaskId;
    this.updateTask(nextTaskId, {
      status: 'running',
      startedAt: now(),
    });

    this.emit({
      taskId: nextTaskId,
      taskName: task.name,
      ...(task.resource ? { resource: task.resource } : {}),
      type: 'task.started',
      status: 'running',
      stepId: null,
      stepName: null,
      message: `${task.name} started.`,
      timestamp: now(),
      logLevel: null,
      errorCode: null,
    });

    try {
      await taskSignalStorage.run(
        task.controller.signal,
        () => task.run(this.createExecutionContext(nextTaskId))
      );
      this.finishTask(nextTaskId, 'success', `${task.name} completed successfully.`);
    } catch (error) {
      const wasCancelled = task.controller.signal.aborted;
      const errorCode = wasCancelled ? cancellationErrorCode : 'task-failed';
      const message = wasCancelled
        ? 'Task was cancelled.'
        : error instanceof Error
          ? error.message
          : 'Task failed due to an unknown error.';

      task.controller.abort();
      this.finishTask(nextTaskId, 'failure', message, error instanceof Error ? error : null, errorCode);
    } finally {
      this.activeTaskId = null;
      void this.startNext();
    }
  }

  private createExecutionContext(taskId: string): TaskExecutionContext {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found.');
    }

    return {
      taskId,
      signal: task.controller.signal,
      startStep: (stepId, stepName, message) => {
        this.assertNotCancelled(taskId);
        this.updateTask(taskId, {
          currentStepId: stepId,
          currentStepName: stepName,
        });
        this.emitTaskEvent(taskId, 'task.step.started', 'running', {
          stepId,
          stepName,
          message: message ?? `${stepName} started.`,
        });
      },
      completeStep: (stepId, stepName, message) => {
        this.assertNotCancelled(taskId);
        this.emitTaskEvent(taskId, 'task.step.completed', 'running', {
          stepId,
          stepName,
          message: message ?? `${stepName} completed.`,
        });
      },
      log: (level, message, stepId, stepName) => {
        this.assertNotCancelled(taskId);
        this.emitTaskEvent(taskId, 'task.log', 'running', {
          stepId: stepId ?? this.tasks.get(taskId)?.currentStepId ?? null,
          stepName: stepName ?? this.tasks.get(taskId)?.currentStepName ?? null,
          message,
          logLevel: level,
        });
      },
      throwIfCancelled: () => {
        this.assertNotCancelled(taskId);
      },
    };
  }

  private emitTaskEvent(
    taskId: string,
    type: TaskProgressEvent['type'],
    status: TaskProgressEvent['status'],
    details: {
      readonly stepId: string | null;
      readonly stepName: string | null;
      readonly message: string;
      readonly logLevel?: TaskProgressEvent['logLevel'];
      readonly errorCode?: string | null;
    }
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    this.emit({
      taskId,
      taskName: task.name,
      ...(task.resource ? { resource: task.resource } : {}),
      type,
      status,
      stepId: details.stepId,
      stepName: details.stepName,
      message: details.message,
      timestamp: now(),
      logLevel: details.logLevel ?? null,
      errorCode: details.errorCode ?? null,
    });
  }

  private finishTask(
    taskId: string,
    status: 'success' | 'failure',
    message: string,
    _error?: Error | null,
    errorCode: string | null = null
  ): void {
    this.updateTask(taskId, {
      status,
      completedAt: now(),
    });

    const type = status === 'success' ? 'task.completed' : 'task.failed';
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    this.emit({
      taskId,
      taskName: task.name,
      ...(task.resource ? { resource: task.resource } : {}),
      type,
      status,
      stepId: task.currentStepId,
      stepName: task.currentStepName,
      message,
      timestamp: now(),
      logLevel: status === 'failure' ? 'error' : null,
      errorCode,
    });
  }

  private assertNotCancelled(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task?.controller.signal.aborted) {
      throw new Error('Task was cancelled.');
    }
  }

  private updateTask(taskId: string, update: Partial<Omit<ManagedTask, 'id' | 'name' | 'run' | 'controller' | 'createdAt'>>): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    this.tasks.set(taskId, {
      ...task,
      ...update,
    });
  }

  private emit(event: TaskProgressEvent): void {
    this.appendEventLog(event);

    if (event.type === 'task.log' && !this.shouldEmitLogEvent(event)) {
      return;
    }

    this.listeners.forEach((listener) => {
      listener(event);
    });
  }

  private shouldEmitLogEvent(event: TaskProgressEvent): boolean {
    const nowMs = Date.now();
    const state = this.logEmitState.get(event.taskId) ?? { lastEmittedAt: 0, burstCount: 0 };

    if (state.burstCount < LOG_EVENT_EMIT_MAX_BURST) {
      this.logEmitState.set(event.taskId, {
        lastEmittedAt: nowMs,
        burstCount: state.burstCount + 1,
      });
      return true;
    }

    if (nowMs - state.lastEmittedAt >= LOG_EVENT_EMIT_INTERVAL_MS) {
      this.logEmitState.set(event.taskId, {
        lastEmittedAt: nowMs,
        burstCount: state.burstCount + 1,
      });
      return true;
    }

    return false;
  }

  private appendEventLog(event: TaskProgressEvent): void {
    if (!this.logDirectory) {
      return;
    }

    try {
      const taskLogsDirectory = path.join(this.logDirectory, 'tasks');
      fs.mkdirSync(taskLogsDirectory, { recursive: true });
      const safeTaskId = event.taskId.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const logPath = path.join(taskLogsDirectory, `${safeTaskId}.log`);
      const level = event.logLevel ?? 'event';
      fs.appendFileSync(
        logPath,
        `[${event.timestamp}] [${level.toUpperCase()}] ${event.message}\n`,
        'utf8'
      );
    } catch {
      // Logging should never make the task itself fail.
    }
  }
}

let instance: TaskRunner | null = null;

export const getTaskRunner = (): TaskRunner => {
  if (!instance) {
    instance = new TaskRunner();
  }

  return instance;
};
