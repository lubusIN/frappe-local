<template>
  <Dialog
    v-if="task"
    v-model="isOpen"
    size="4xl"
    position="top"
    padding-top="1.25rem"
  >
    <template #title>
      <div class="flex items-center min-w-0 gap-3">
        <div class="flex items-center justify-center rounded-6 size-9 shrink-0 bg-surface-gray-2 text-ink-gray-6">
          <span
            class="lucide-terminal size-[18px]"
            aria-hidden="true"
          />
        </div>
        <div class="min-w-0">
          <div class="flex items-center min-w-0 gap-2">
            <h3 class="m-0 text-base-semibold truncate text-ink-gray-9">
              {{ formatTaskTitle(task.taskName) }}
            </h3>
            <Badge
              class="shrink-0"
              variant="subtle"
              :theme="statusThemeValue"
            >
              {{ formattedStatus }}
              <LoadingIndicator
                v-if="isBusy"
                class="size-2.5"
              />
            </Badge>
          </div>
          <p class="mt-1 text-xs truncate text-ink-gray-5">
            logs from background tasks
          </p>
        </div>
      </div>
    </template>

    <template #default>
      <div class="overflow-hidden border rounded-6 border-outline-gray-3 bg-surface-base flex flex-col">
        <!-- Header Bar with Steps count & Search field -->
        <TaskLogHeader
          v-model:search-query="searchQuery"
          :step-count="filteredStepGroups.length"
          :entry-count-label="entryCountLabel"
          :all-expanded="allExpanded"
          @toggle-expand-all="toggleExpandAll"
        />

        <!-- Grouped Steps Container -->
        <div
          ref="logsContainer"
          class="max-h-[45vh] min-h-[250px] overflow-y-auto divide-y divide-outline-gray-2 [-webkit-app-region:no-drag]"
          tabindex="0"
          @mousedown.stop
        >
          <div
            v-if="filteredStepGroups.length === 0"
            class="flex items-center justify-center min-h-48 text-ink-gray-4 text-xs"
          >
            {{ searchQuery ? 'No log lines match your search.' : 'Waiting for log output...' }}
          </div>

          <TaskLogStepGroup
            v-for="group in filteredStepGroups"
            :key="group.id"
            :group="group"
            :is-expanded="isStepExpanded(group.id)"
            :is-busy="isBusy"
            :search-query="searchQuery"
            @toggle="toggleStep(group.id)"
          />
        </div>

        <div
          v-if="displayedLogs.length > 0"
          class="flex items-center justify-between border-t border-outline-gray-2 px-4 py-2.5 bg-surface-base"
        >
          <span class="text-xs text-ink-gray-4">
            {{ footerStatusLabel }}
          </span>
          <TaskTimer
            :start-time="displayedLogs[0]?.timestamp || 0"
            :end-time="displayedLogs[displayedLogs.length - 1]?.timestamp"
            :running="isBusy"
            size-class="text-xs"
            color-class="text-ink-gray-4"
          />
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <Switch
            v-model="autoScroll"
            label="Auto-scroll"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Button
            v-if="isBusy"
            size="md"
            variant="outline"
            theme="red"
            :loading="isCancelling"
            @click="showCancelConfirm = true"
          >
            Cancel Task
          </Button>
          <Button
            v-if="task.logs.length > 0 && !fullLogLoaded"
            size="md"
            variant="subtle"
            :loading="loadingFullLog"
            @click="onLoadFullLogs"
          >
            Load full logs
          </Button>
          <Button
            v-if="displayedLogs.length > 0"
            size="md"
            variant="subtle"
            :icon-left="'lucide-copy'"
            @click="onCopyLogs"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </Button>
          <Button
            size="md"
            variant="subtle"
            @click="emit('close')"
          >
            Close
          </Button>
        </div>
      </div>
    </template>
  </Dialog>

  <ConfirmationDialog
    :open="showCancelConfirm"
    title="Cancel Task"
    message="Are you sure you want to cancel this task? It will be forcefully aborted, which may leave resources in an inconsistent state."
    confirm-label="Cancel Task"
    @confirm="onCancelTask"
    @cancel="showCancelConfirm = false"
  />
</template>

<script setup lang="ts">
import TaskLogHeader from '@frappe-local/renderer/components/task-logs/TaskLogHeader.vue';
import TaskLogStepGroup from '@frappe-local/renderer/components/task-logs/TaskLogStepGroup.vue';
import { Badge, Button, Dialog, LoadingIndicator, Switch, toast } from 'frappe-ui';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import TaskTimer from '@frappe-local/renderer/components/ui/TaskTimer.vue';
import { computed, nextTick, ref, watch } from 'vue';
import type { ProgressTaskSummary } from '@frappe-local/renderer/controllers';
import type { TaskLogLevel, TaskProgressEvent } from '@frappe-local/shared/domain';
import { formatStatus, statusTheme } from '@frappe-local/renderer/utils';
import { useIpc } from '@frappe-local/renderer/composables/system';
import { useAppCatalog } from '@frappe-local/renderer/composables/data';

const { formatTaskTitle } = useAppCatalog();

const props = defineProps<{
  task: ProgressTaskSummary | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const logsContainer = ref<HTMLElement | null>(null);
const copied = ref(false);
const fullLogText = ref<string | null>(null);
const loadingFullLog = ref(false);
const showCancelConfirm = ref(false);
const isCancelling = ref(false);
const searchQuery = ref('');
const expandedSteps = ref<Set<string>>(new Set());
const initializedTask = ref<string | null>(null);

const FULL_LOG_LINE_PATTERN = /^\[([^\]]+)\] \[([A-Z]+)\] (?:\[([^|\]]*)\|([^|\]]*)\|([^\]]*)\] )?(.*)$/;
const ipc = useIpc();

type DisplayLog = {
  readonly message: string;
  readonly timestamp: string;
  readonly level: TaskLogLevel | null;
  readonly stepId: string | null;
  readonly stepName: string | null;
  readonly type?: TaskProgressEvent['type'];
};

type StepGroup = {
  readonly id: string;
  readonly name: string;
  status: 'running' | 'success' | 'failure' | 'skipped';
  readonly startTime: string;
  endTime?: string;
  completionSummary?: string;
  logs: Array<{
    readonly lineNumber: number;
    readonly message: string;
    readonly timestamp: string;
    readonly logLevel: TaskLogLevel | null;
  }>;
};

const LOCAL_STORAGE_KEY = 'frappe-local:task-log-auto-scroll';
const savedAutoScroll = localStorage.getItem(LOCAL_STORAGE_KEY);
const autoScroll = ref(savedAutoScroll !== null ? savedAutoScroll === 'true' : true);

watch(autoScroll, (val) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, String(val));
});

const isOpen = computed({
  get: () => Boolean(props.task),
  set: (value: boolean) => {
    if (!value) {
      emit('close');
    }
  },
});

const isBusy = computed(() => props.task?.status === 'running' || props.task?.status === 'queued');
const fullLogLoaded = computed(() => fullLogText.value !== null);

const parseFullLogLine = (line: string): DisplayLog => {
  const fallbackTimestamp = props.task?.timestamp ?? new Date().toISOString();
  const match = FULL_LOG_LINE_PATTERN.exec(line);

  if (!match) {
    return {
      message: line,
      timestamp: fallbackTimestamp,
      level: null,
      stepId: null,
      stepName: null,
    };
  }

  const parsedLevel = match[2]?.toLowerCase();
  const level: TaskLogLevel | null =
    parsedLevel === 'info' || parsedLevel === 'warning' || parsedLevel === 'error'
      ? parsedLevel
      : null;
  const parsedTimestamp = match[1];
  const timestamp =
    parsedTimestamp && !Number.isNaN(Date.parse(parsedTimestamp))
      ? parsedTimestamp
      : fallbackTimestamp;

  return {
    message: match[6] || '',
    timestamp,
    level,
    type: (match[3] as TaskProgressEvent['type']) || undefined,
    stepId: match[4] || null,
    stepName: match[5] || null,
  };
};

const fullLogLines = computed(() => {
  if (fullLogText.value === null) return [];
  return fullLogText.value
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map(parseFullLogLine);
});

const displayedLogs = computed(() => {
  const raw = fullLogLoaded.value ? fullLogLines.value : props.task?.logs ?? [];
  return raw.map((log) => ({
    ...log,
    message: formatTaskTitle(log.message),
  }));
});

const stepGroups = computed(() => {
  const logs = displayedLogs.value;
  if (!logs.length) return [];

  const groups: StepGroup[] = [];
  let currentGroup: StepGroup | null = null;
  let lineNumber = 1;

  for (const log of logs) {
    const targetStepId = log.stepId || (log.type === 'task.queued' || log.type === 'task.started' ? 'init' : 'general');
    const targetStepName = log.stepName || (targetStepId === 'init' ? 'Setup task' : formatTaskTitle(props.task?.taskName || 'Execution Output'));

    if (!currentGroup || (log.stepId && currentGroup.id !== log.stepId) || (log.type === 'task.step.started' && currentGroup.id !== log.stepId)) {
      let existing = groups.find((g) => g.id === targetStepId);
      if (!existing) {
        existing = {
          id: targetStepId,
          name: targetStepName,
          status: 'running',
          startTime: log.timestamp,
          logs: [],
        };
        groups.push(existing);
      }
      currentGroup = existing;
      lineNumber = currentGroup.logs.length + 1;
    }

    const isBoilerplateStart = log.type === 'task.step.started' && log.message === `${log.stepName} started.`;
    const isBoilerplateComplete = log.type === 'task.step.completed' && log.message === `${log.stepName} completed.`;

    if (log.type === 'task.step.completed') {
      currentGroup.endTime = log.timestamp;
      const summaryText = log.message.endsWith(' completed.')
        ? log.message.slice(0, -11)
        : log.message;
      if (summaryText && summaryText !== currentGroup.name) {
        currentGroup.completionSummary = summaryText;
      }
    }

    if (!isBoilerplateStart && !isBoilerplateComplete) {
      currentGroup.logs.push({
        lineNumber: lineNumber++,
        message: log.message,
        timestamp: log.timestamp,
        logLevel: log.level ?? null,
      });
      currentGroup.endTime = log.timestamp;
    }
  }

  const isTaskRunning = isBusy.value;
  const isTaskFailed = props.task?.status === 'failure';

  return groups.map((g, index) => {
    const isLast = index === groups.length - 1;
    const hasError = g.logs.some((l) => l.logLevel === 'error');

    let status: StepGroup['status'] = 'success';
    if (hasError || (isLast && isTaskFailed)) {
      status = 'failure';
    } else if (isLast && isTaskRunning) {
      status = 'running';
    }

    const logs = g.logs.length > 0 ? g.logs : [
      {
        lineNumber: 1,
        message: g.completionSummary || (status === 'success' ? `${g.name} completed.` : status === 'running' ? `Running ${g.name}...` : `${g.name} failed.`),
        timestamp: g.endTime || g.startTime,
        logLevel: status === 'failure' ? ('error' as const) : null,
      }
    ];

    return {
      ...g,
      status,
      logs,
    };
  });
});

const filteredStepGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) {
    return stepGroups.value.map((g) => ({ ...g, displayLogs: g.logs, matchCount: undefined }));
  }

  return stepGroups.value
    .map((g) => {
      const nameMatches = g.name.toLowerCase().includes(q);
      const matchingLogs = g.logs.filter((l) => l.message.toLowerCase().includes(q));
      if (!nameMatches && matchingLogs.length === 0) {
        return null;
      }
      return {
        ...g,
        displayLogs: matchingLogs.length > 0 ? matchingLogs : g.logs,
        matchCount: matchingLogs.length,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);
});

watch(
  () => [props.task?.taskId, stepGroups.value.length] as const,
  ([currentTaskId]) => {
    if (!currentTaskId) return;
    if (initializedTask.value !== currentTaskId) {
      initializedTask.value = currentTaskId;
      expandedSteps.value.clear();
    }

    stepGroups.value.forEach((group, index) => {
      const isLast = index === stepGroups.value.length - 1;
      if (isLast && (isBusy.value || group.status === 'failure')) {
        expandedSteps.value.add(group.id);
      }
    });
  },
  { immediate: true }
);

const isStepExpanded = (stepId: string) => {
  if (searchQuery.value.trim() !== '') return true;
  return expandedSteps.value.has(stepId);
};

const toggleStep = (stepId: string) => {
  if (searchQuery.value.trim() !== '') return;
  if (expandedSteps.value.has(stepId)) {
    expandedSteps.value.delete(stepId);
  } else {
    expandedSteps.value.add(stepId);
  }
};

const allExpanded = computed(() =>
  stepGroups.value.length > 0 && stepGroups.value.every((g) => expandedSteps.value.has(g.id))
);

const toggleExpandAll = () => {
  if (allExpanded.value) {
    expandedSteps.value.clear();
  } else {
    stepGroups.value.forEach((g) => expandedSteps.value.add(g.id));
  }
};

const totalLineCount = computed(() => displayedLogs.value.length);
const entryCountLabel = computed(() => {
  const count = totalLineCount.value;
  const suffix = count === 1 ? 'entry' : 'entries';
  return fullLogLoaded.value ? `${count} full ${suffix}` : `${count} total ${suffix}`;
});

const footerStatusLabel = computed(() => {
  if (fullLogLoaded.value) return 'Full task log loaded';
  if (isBusy.value) return 'Task is still running';
  return 'Task finished';
});

const formattedStatus = computed(() => {
  if (!props.task) return '';

  if (props.task.status === 'queued') return 'Queued';

  if (isBusy.value) {
    const name = String(props.task.taskName ?? '').toLowerCase();
    const verb = name.split(' ')[0];

    switch (verb) {
      case 'create': return 'Creating';
      case 'stop': return 'Stopping';
      case 'start': return 'Starting';
      case 'restart': return 'Restarting';
      case 'delete': return 'Deleting';
      case 'clean': return 'Cleaning';
      case 'install': return 'Installing';
      case 'uninstall': return 'Uninstalling';
      case 'get': return 'Getting app';
      case 'remove': return 'Removing app';
      default:
        return 'Processing';
    }
  }

  if (props.task.status === 'success') return 'Success';
  if (props.task.status === 'failure') {
    const message = String(props.task.message ?? '').toLowerCase();
    if (message.includes('cancelled')) return 'Cancelled';
    if (message.includes('timed out')) return 'Timed out';
    return 'Failed';
  }

  return formatStatus(props.task.status || 'Unknown', 'task');
});

const statusThemeValue = computed(() => statusTheme(props.task?.status || '', 'task'));

const formatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });



const formatLevel = (level: TaskProgressEvent['logLevel']) => {
  if (level === 'error') return 'ERROR';
  if (level === 'warning') return 'WARN';
  if (level === 'info') return 'INFO';
  return 'EVENT';
};



const scrollToBottom = () => {
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
  }
};

watch(logsContainer, (el) => {
  if (el) {
    nextTick(() => {
      scrollToBottom();
      let attempts = 0;
      const interval = setInterval(() => {
        scrollToBottom();
        if (++attempts >= 10) clearInterval(interval);
      }, 50);
    });
  }
});

watch(
  () => displayedLogs.value.length,
  async () => {
    if (!autoScroll.value) return;
    await nextTick();
    scrollToBottom();
  }
);

watch(
  () => props.task?.taskId,
  () => {
    fullLogText.value = null;
    copied.value = false;
    searchQuery.value = '';
  }
);

const onLoadFullLogs = async () => {
  if (!props.task || loadingFullLog.value) return;

  loadingFullLog.value = true;
  try {
    const content = await ipc.readTaskLog(props.task.taskId);
    if (!content.trim()) {
      toast.warning('Full log file is not available yet');
      return;
    }
    fullLogText.value = content;
    await nextTick();
    scrollToBottom();
  } catch {
    toast.error('Failed to load full logs');
  } finally {
    loadingFullLog.value = false;
  }
};

const onCopyLogs = async () => {
  if (displayedLogs.value.length === 0 || copied.value) return;

  const text = fullLogText.value
    ? formatTaskTitle(fullLogText.value)
    : stepGroups.value
      .map((g) => {
        const header = `=== ${g.name} (${g.status.toUpperCase()}) ===`;
        const lines = g.logs.map((log) => `${log.lineNumber}\t[${formatTime(log.timestamp)}] [${formatLevel(log.logLevel)}] ${log.message}`).join('\n');
        return `${header}\n${lines}`;
      })
      .join('\n\n');

  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    toast.success('Logs copied to clipboard');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    toast.error('Failed to copy logs');
  }
};

const onCancelTask = async () => {
  if (!props.task) return;
  showCancelConfirm.value = false;
  isCancelling.value = true;
  try {
    const cancelled = await ipc.cancelTask(props.task.taskId);
    if (!cancelled) {
      toast.error('Could not cancel task');
    }
  } catch (error) {
    toast.error('Failed to cancel task: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    isCancelling.value = false;
  }
};
</script>
