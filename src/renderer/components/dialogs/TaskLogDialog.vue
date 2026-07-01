<template>
  <Dialog
    v-if="task"
    v-model="isOpen"
    size="5xl"
  >
    <template #title>
      <div class="flex items-center min-w-0 gap-3">
        <div class="flex items-center justify-center rounded-lg size-9 shrink-0 bg-surface-gray-2 text-ink-gray-6">
          <IconTerminal class="size-[18px]" />
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
      <div class="overflow-hidden border rounded-lg border-outline-gray-3 bg-surface-base flex flex-col">
        <!-- Header Bar with Steps count & Search field -->
        <div class="flex flex-wrap items-center justify-between border-b border-outline-gray-2 px-4 py-2.5 gap-3 bg-surface-gray-1">
          <div class="flex items-center gap-2">
            <span class="text-xs-medium text-ink-gray-7">
              {{ filteredStepGroups.length }} {{ filteredStepGroups.length === 1 ? 'step' : 'steps' }}
            </span>
            <span class="text-ink-gray-3">•</span>
            <span class="text-xs text-ink-gray-5">
              {{ entryCountLabel }}
            </span>
          </div>

          <div class="flex items-center gap-2 flex-1 justify-end min-w-[220px]">
            <div class="w-64 max-w-full">
              <TextInput
                v-model="searchQuery"
                type="search"
                placeholder="Search logs…"
                variant="outline"
              >
                <template #prefix>
                  <IconSearch class="w-3.5 text-ink-gray-5" />
                </template>
              </TextInput>
            </div>
            <Button
              size="sm"
              variant="subtle"
              @click="toggleExpandAll"
            >
              {{ allExpanded ? 'Collapse all' : 'Expand all' }}
            </Button>
          </div>
        </div>

        <!-- Grouped Steps Container -->
        <div
          ref="logsContainer"
          class="max-h-[55vh] min-h-[320px] overflow-y-auto divide-y divide-outline-gray-2 [-webkit-app-region:no-drag]"
          tabindex="0"
          @mousedown.stop
        >
          <div
            v-if="filteredStepGroups.length === 0"
            class="flex items-center justify-center min-h-48 text-ink-gray-4 text-xs"
          >
            {{ searchQuery ? 'No log lines match your search.' : 'Waiting for log output...' }}
          </div>

          <div
            v-for="group in filteredStepGroups"
            :key="group.id"
            class="flex flex-col"
          >
            <!-- Step Header -->
            <div
              class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none transition-colors sticky top-0 z-10"
              :class="[
                isStepExpanded(group.id)
                  ? 'bg-surface-gray-2 font-medium text-ink-gray-9 border-b border-outline-gray-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'bg-surface-base hover:bg-surface-gray-1 text-ink-gray-8'
              ]"
              @click="toggleStep(group.id)"
            >
              <div class="flex items-center min-w-0 gap-2.5">
                <IconChevronDown
                  v-if="isStepExpanded(group.id)"
                  class="size-4 shrink-0 text-ink-gray-5 transition-transform"
                />
                <IconChevronRight
                  v-else
                  class="size-4 shrink-0 text-ink-gray-5 transition-transform"
                />

                <span class="flex items-center justify-center shrink-0">
                  <IconCheckCircle2 v-if="group.status === 'success'" class="size-4 text-ink-green-6" />
                  <LoadingIndicator v-else-if="group.status === 'running'" class="size-3.5 text-ink-blue-6" />
                  <IconXCircle v-else-if="group.status === 'failure'" class="size-4 text-ink-red-6" />
                  <IconCircle v-else class="size-4 text-ink-gray-4" />
                </span>

                <span class="text-xs-medium truncate">
                  {{ group.name }}
                </span>

                <Badge
                  v-if="searchQuery && group.matchCount !== undefined"
                  variant="subtle"
                  theme="gray"
                  class="text-[10px]"
                >
                  {{ group.matchCount }} {{ group.matchCount === 1 ? 'match' : 'matches' }}
                </Badge>
              </div>

              <div class="flex items-center gap-3 shrink-0 ml-2">
                <TaskTimer
                  :start-time="group.startTime"
                  :end-time="group.endTime"
                  :running="group.status === 'running' && isBusy"
                  :show-label="false"
                  size-class="text-xs"
                  :color-class="group.status === 'failure' ? 'text-ink-red-6 font-semibold' : 'text-ink-gray-5'"
                />
              </div>
            </div>

            <!-- Step Log Lines (when expanded) -->
            <div
              v-if="isStepExpanded(group.id)"
              class="bg-surface-base py-1.5 overflow-x-auto font-mono text-xs leading-5 cursor-text select-text"
            >
              <div
                v-for="log in group.displayLogs"
                :key="`${group.id}-${log.lineNumber}`"
                class="grid grid-cols-[48px_minmax(0,1fr)] gap-3 px-4 py-0.5 hover:bg-surface-gray-1 transition-colors"
              >
                <span
                  class="text-right tabular-nums text-ink-gray-4 select-none pr-2.5 border-r border-outline-gray-2"
                  :title="formatFullTime(log.timestamp)"
                >
                  {{ log.lineNumber }}
                </span>
                <div class="min-w-0 break-words whitespace-pre-wrap flex items-start gap-2">
                  <span
                    v-if="log.level && log.level !== 'info'"
                    class="shrink-0 uppercase text-[10px] font-semibold px-1 rounded mt-0.5"
                    :class="levelBadgeClass(log.level)"
                  >
                    {{ log.level }}
                  </span>
                  <span :class="messageClass(log.level)">{{ log.message }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="displayedLogs.length > 0"
          class="flex items-center justify-between border-t border-outline-gray-2 px-4 py-2.5 bg-surface-base"
        >
          <span class="text-xs text-ink-gray-4">
            {{ footerStatusLabel }}
          </span>
          <TaskTimer
            :start-time="displayedLogs[0].timestamp"
            :end-time="displayedLogs[displayedLogs.length - 1].timestamp"
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
            :icon-left="IconCopy"
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

  <ConfirmDialog
    v-model="showCancelConfirm"
    title="Cancel Task"
    message="Are you sure you want to cancel this task? It will be forcefully aborted, which may leave resources in an inconsistent state."
    @confirm="onCancelTask"
  />
</template>

<script setup lang="ts">
import { Badge, Button, ConfirmDialog, Dialog, LoadingIndicator, Switch, TextInput, toast } from 'frappe-ui';
import IconTerminal from '~icons/lucide/terminal';
import IconCopy from '~icons/lucide/copy';
import IconSearch from '~icons/lucide/search';
import IconChevronDown from '~icons/lucide/chevron-down';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconCheckCircle2 from '~icons/lucide/check-circle-2';
import IconXCircle from '~icons/lucide/x-circle';
import IconCircle from '~icons/lucide/circle';
import { computed, nextTick, ref, watch } from 'vue';
import type { ProgressTaskSummary } from '@frappe-local/renderer/controllers';
import type { TaskLogLevel, TaskProgressEvent } from '@frappe-local/shared/domain';
import { formatStatus, statusTheme } from '@frappe-local/renderer/utils';
import { useIpc } from '@frappe-local/renderer/composables/system';
import { useAppCatalog } from '@frappe-local/renderer/composables/data';
import TaskTimer from '@frappe-local/renderer/components/ui/TaskTimer.vue';

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
    readonly level: TaskLogLevel | null;
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

  const parsedLevel = match[2].toLowerCase();
  const level: TaskLogLevel | null =
    parsedLevel === 'info' || parsedLevel === 'warning' || parsedLevel === 'error'
      ? parsedLevel
      : null;
  const timestamp = Number.isNaN(Date.parse(match[1])) ? fallbackTimestamp : match[1];

  return {
    message: match[6],
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
        level: log.level ?? null,
      });
      currentGroup.endTime = log.timestamp;
    }
  }

  const isTaskRunning = isBusy.value;
  const isTaskFailed = props.task?.status === 'failure';

  return groups.map((g, index) => {
    const isLast = index === groups.length - 1;
    const hasError = g.logs.some((l) => l.level === 'error');

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
        level: status === 'failure' ? ('error' as const) : null,
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

const formatFullTime = (timestamp: string) => new Date(timestamp).toLocaleString();

const formatLevel = (level: TaskProgressEvent['logLevel']) => {
  if (level === 'error') return 'ERROR';
  if (level === 'warning') return 'WARN';
  if (level === 'info') return 'INFO';
  return 'EVENT';
};

const levelBadgeClass = (level: TaskProgressEvent['logLevel']) => {
  if (level === 'error') return 'bg-surface-red-2 text-ink-red-6';
  if (level === 'warning') return 'bg-surface-amber-2 text-ink-amber-6';
  return 'bg-surface-gray-3 text-ink-gray-6';
};

const messageClass = (level: TaskProgressEvent['logLevel']) => {
  if (level === 'error') return 'text-ink-red-5';
  if (level === 'warning') return 'text-ink-amber-5';
  return 'text-ink-gray-7';
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
        const lines = g.logs.map((log) => `${log.lineNumber}\t[${formatTime(log.timestamp)}] [${formatLevel(log.level)}] ${log.message}`).join('\n');
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
    if (cancelled) {
      toast.success('Task cancelled');
    } else {
      toast.error('Could not cancel task (it may have already completed)');
    }
  } catch (error) {
    toast.error('Failed to cancel task: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    isCancelling.value = false;
  }
};
</script>
