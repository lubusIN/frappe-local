import type { RendererBridge, RuntimeHealthResponse, RuntimeRepairInput } from '../shared/ipc';
import type { TaskProgressEvent, TaskStatus } from '../shared/domain/task-runner';

export type RuntimeHealthControllerState = {
  health: RuntimeHealthResponse | null;
  loading: boolean;
  repairing: boolean;
  error: string | null;
  activeTaskId: string | null;
  activeTaskStatus: TaskStatus | null;
  lastTaskMessage: string | null;
  repairLogs: string[];
};

export type RuntimeHealthBridge = Pick<
  RendererBridge,
  'getRuntimeHealth' | 'repairRuntime' | 'subscribeTaskRunnerEvents' | 'unsubscribeTaskRunnerEvents' | 'onTaskRunnerProgress'
>;

export const createDefaultRuntimeHealthState = (): RuntimeHealthControllerState => ({
  health: null,
  loading: false,
  repairing: false,
  error: null,
  activeTaskId: null,
  activeTaskStatus: null,
  lastTaskMessage: null,
  repairLogs: [],
});

export const formatRuntimeTaskLog = (event: TaskProgressEvent): string => `${event.type}: ${event.message}`;

export const applyRuntimeTaskEvent = (
  state: RuntimeHealthControllerState,
  event: TaskProgressEvent
): boolean => {
  if (state.activeTaskId !== event.taskId) {
    return false;
  }

  state.activeTaskStatus = event.status;
  state.lastTaskMessage = event.message;
  state.repairLogs = [formatRuntimeTaskLog(event), ...state.repairLogs].slice(0, 50);

  if (event.type === 'task.completed' || event.type === 'task.failed') {
    state.repairing = false;
  }

  return true;
};

export const createRuntimeHealthController = (
  ipc: RuntimeHealthBridge,
  state: RuntimeHealthControllerState = createDefaultRuntimeHealthState()
) => {
  let disposeListener: (() => void) | null = null;

  const refresh = async (): Promise<RuntimeHealthResponse | null> => {
    state.loading = true;
    state.error = null;

    try {
      const response = await ipc.getRuntimeHealth();
      state.health = response;
      return response;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      state.loading = false;
    }
  };

  const connect = async (): Promise<void> => {
    await ipc.subscribeTaskRunnerEvents();
    disposeListener = ipc.onTaskRunnerProgress((event) => {
      const applied = applyRuntimeTaskEvent(state, event);
      if (applied && (event.type === 'task.completed' || event.type === 'task.failed')) {
        void refresh();
      }
    });
  };

  const disconnect = async (): Promise<void> => {
    disposeListener?.();
    disposeListener = null;
    await ipc.unsubscribeTaskRunnerEvents();
  };

  const repair = async (input: RuntimeRepairInput = {}): Promise<void> => {
    state.error = null;

    try {
      const response = await ipc.repairRuntime(input);
      state.activeTaskId = response.taskId;
      state.activeTaskStatus = 'queued';
      state.lastTaskMessage = `Queued repair for ${response.preferredRuntime}.`;
      state.repairLogs = [];
      state.repairing = true;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      state.repairing = false;
    }
  };

  return {
    state,
    refresh,
    connect,
    disconnect,
    repair,
  };
};