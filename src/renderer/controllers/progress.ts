import type { RendererBridge } from '../../shared/core/ipc';
import type { TaskProgressEvent, TaskStatus } from '../../shared/domain/task-runner';

export type ProgressTaskResource = 'bench' | 'site' | 'runtime' | 'system';

export type ProgressTaskSummary = {
  readonly taskId: string;
  readonly taskName: string;
  readonly status: TaskStatus;
  readonly type: TaskProgressEvent['type'];
  readonly message: string;
  readonly logs: Array<{ message: string; timestamp: string; level: TaskProgressEvent['logLevel'] }>;
  readonly stepName: string | null;
  readonly timestamp: string;
  readonly errorCode: string | null;
  readonly resource: ProgressTaskResource;
  readonly resourceId: string | null;
};

export type ProgressCenterState = {
  tasks: ProgressTaskSummary[];
  loading: boolean;
  error: string | null;
  statusFilter: TaskStatus | 'all';
  resourceFilter: ProgressTaskResource | 'all';
  recentOnly: boolean;
};

export type ProgressCenterBridge = Pick<
  RendererBridge,
  'subscribeTaskRunnerEvents' | 'unsubscribeTaskRunnerEvents' | 'onTaskRunnerProgress'
>;

const MAX_TASKS = 120;
export const MAX_LOGS_PER_TASK = 800;
const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24;

export const createDefaultProgressCenterState = (): ProgressCenterState => ({
  tasks: [],
  loading: false,
  error: null,
  statusFilter: 'all',
  resourceFilter: 'all',
  recentOnly: true,
});

export const reconcileSavedProgressTasks = (tasks: readonly ProgressTaskSummary[]): ProgressTaskSummary[] =>
  tasks.map((task) => {
    const logs = Array.isArray(task.logs) ? task.logs.slice(-MAX_LOGS_PER_TASK) : [];
    if (task.status !== 'queued' && task.status !== 'running') {
      return {
        ...task,
        logs,
      };
    }

    return {
      ...task,
      status: 'failure' as const,
      type: 'task.failed' as const,
      message: 'Task was interrupted when the app closed.',
      logs: [
        ...logs,
        {
          message: 'Task was interrupted when the app closed.',
          timestamp: new Date().toISOString(),
          level: 'warning' as const,
        },
      ].slice(-MAX_LOGS_PER_TASK),
      errorCode: 'task-interrupted',
    };
  });

export const detectProgressTaskResource = (taskName: string): ProgressTaskResource => {
  const normalized = taskName.trim().toLowerCase();

  if (normalized.includes('bench')) {
    return 'bench';
  }

  if (normalized.includes('site')) {
    return 'site';
  }

  if (normalized.includes('runtime') || normalized.includes('dependency')) {
    return 'runtime';
  }

  return 'system';
};

export const upsertProgressTask = (
  tasks: ProgressTaskSummary[],
  event: TaskProgressEvent
): ProgressTaskSummary[] => {
  const payloadResource = event.resource?.type;

  const existing = tasks.find((item) => item.taskId === event.taskId);
  const newLogEntry = {
    message: event.message,
    timestamp: event.timestamp,
    level: event.logLevel,
  };
  const logs = existing ? [...existing.logs, newLogEntry] : [newLogEntry];

  const next: ProgressTaskSummary = {
    taskId: event.taskId,
    taskName: event.taskName,
    status: event.status,
    type: event.type,
    message: event.message,
    logs: logs.slice(-MAX_LOGS_PER_TASK),
    stepName: event.stepName,
    timestamp: event.timestamp,
    errorCode: event.errorCode ?? existing?.errorCode ?? null,
    resource: payloadResource ?? detectProgressTaskResource(event.taskName),
    resourceId: event.resource?.id ?? null,
  };

  const withoutCurrent = tasks.filter((item) => item.taskId !== event.taskId);
  const sorted = [next, ...withoutCurrent].sort(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)
  );
  return sorted.slice(0, MAX_TASKS);
};

export const filterProgressTasks = (
  state: Pick<ProgressCenterState, 'tasks' | 'statusFilter' | 'resourceFilter' | 'recentOnly'>,
  now = Date.now()
): ProgressTaskSummary[] => {
  return state.tasks.filter((task) => {
    if (state.statusFilter !== 'all' && task.status !== state.statusFilter) {
      return false;
    }

    if (state.resourceFilter !== 'all' && task.resource !== state.resourceFilter) {
      return false;
    }

    if (!state.recentOnly) {
      return true;
    }

    return now - Date.parse(task.timestamp) <= RECENT_WINDOW_MS;
  });
};

export const findUnhandledFailedTask = (
  tasks: readonly ProgressTaskSummary[],
  handledTaskIds: ReadonlySet<string>
): ProgressTaskSummary | null => {
  return tasks.find((task) =>
    task.type === 'task.failed'
    && task.errorCode !== 'cancelled'
    && !handledTaskIds.has(task.taskId)
  ) ?? null;
};

export const createProgressCenterController = (
  ipc: ProgressCenterBridge,
  state: ProgressCenterState = createDefaultProgressCenterState()
) => {
  let disposeListener: (() => void) | null = null;

  const connect = async (): Promise<void> => {
    state.loading = true;
    state.error = null;

    try {
      await ipc.subscribeTaskRunnerEvents();
      disposeListener = ipc.onTaskRunnerProgress((event) => {
        state.tasks = upsertProgressTask(state.tasks, event);
      });
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.loading = false;
    }
  };

  const disconnect = async (): Promise<void> => {
    disposeListener?.();
    disposeListener = null;
    await ipc.unsubscribeTaskRunnerEvents();
  };

  return {
    state,
    connect,
    disconnect,
  };
};
