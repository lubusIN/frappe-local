export const taskStatuses = ['queued', 'running', 'success', 'failure'] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskEventTypes = [
  'task.started',
  'task.step.started',
  'task.step.completed',
  'task.log',
  'task.failed',
  'task.completed',
] as const;

export type TaskEventType = (typeof taskEventTypes)[number];

export const taskLogLevels = ['info', 'warning', 'error'] as const;

export type TaskLogLevel = (typeof taskLogLevels)[number];

export type TaskSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly status: TaskStatus;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly currentStepId: string | null;
  readonly currentStepName: string | null;
};

export type TaskProgressEvent = {
  readonly taskId: string;
  readonly taskName: string;
  readonly type: TaskEventType;
  readonly status: TaskStatus;
  readonly stepId: string | null;
  readonly stepName: string | null;
  readonly message: string;
  readonly timestamp: string;
  readonly logLevel: TaskLogLevel | null;
  readonly errorCode: string | null;
};