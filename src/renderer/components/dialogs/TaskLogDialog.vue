<template>
  <Dialog
    v-if="task"
    v-model="isOpen"
    :options="{ size: '5xl' }"
  >
    <template #body-title>
      <div class="flex items-center min-w-0 gap-3">
        <div class="flex items-center justify-center rounded-lg size-9 shrink-0 bg-surface-gray-2 text-ink-gray-6">
          <IconTerminal class="size-[18px]" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center min-w-0 gap-2">
            <h3 class="m-0 text-base font-semibold truncate text-ink-gray-9">
              {{ task.taskName }}
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

    <template #body-content>
      <div class="overflow-hidden border rounded-lg border-outline-gray-3 bg-surface-gray-7">
        <div class="flex items-center justify-between border-b border-outline-gray-5 px-4 py-2.5">
          <div class="flex items-center gap-2">
            <span class="rounded-full size-2 bg-surface-red-5" />
            <span class="rounded-full size-2 bg-surface-amber-5" />
            <span class="rounded-full size-2 bg-surface-green-5" />
            <span class="ml-1 text-xs font-medium text-ink-gray-4">Output</span>
          </div>
          <span class="text-xs tabular-nums text-ink-gray-4">
            {{ task.logs.length }} {{ task.logs.length === 1 ? 'entry' : 'entries' }}
          </span>
        </div>

        <div
          ref="logsContainer"
          class="task-log-output max-h-[58vh] min-h-52 cursor-text select-text overflow-auto py-2 font-mono text-xs leading-5"
          tabindex="0"
          @mousedown.stop
          @click.stop
        >
          <div
            v-if="task.logs.length === 0"
            class="flex items-center justify-center min-h-48 text-ink-gray-4"
          >
            Waiting for log output...
          </div>
          <div
            v-else-if="hiddenLogCount > 0"
            class="px-4 py-2 text-ink-gray-5"
          >
            Showing latest {{ visibleLogs.length }} entries. {{ hiddenLogCount }} older
            {{ hiddenLogCount === 1 ? 'entry is' : 'entries are' }} kept out of view to keep the app responsive.
          </div>
          <div
            v-for="(log, index) in visibleLogs"
            :key="`${log.timestamp}-${index}`"
            class="grid grid-cols-[72px_58px_minmax(0,1fr)] gap-3 px-4 py-1 transition-colors hover:bg-surface-gray-6"
          >
            <time
              class="tabular-nums text-ink-gray-4"
              :datetime="log.timestamp"
              :title="formatFullTime(log.timestamp)"
            >
              {{ formatTime(log.timestamp) }}
            </time>
            <span
              class="font-semibold"
              :class="levelClass(log.level)"
            >
              {{ formatLevel(log.level) }}
            </span>
            <span
              class="min-w-0 break-words whitespace-pre-wrap text-ink-gray-3"
              :class="messageClass(log.level)"
            >{{ log.message }}</span>
          </div>
        </div>

        <div
          v-if="task.logs.length > 0"
          class="flex items-center justify-between border-t border-outline-gray-5 px-4 py-2.5"
        >
          <span class="text-xs text-ink-gray-4">
            {{ isBusy ? 'Task is still running' : 'Task finished' }}
          </span>
          <TaskTimer
            :start-time="task.logs[0].timestamp"
            :end-time="task.logs[task.logs.length - 1].timestamp"
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
          <Switch v-model="autoScroll" />
          <button
            type="button"
            class="text-sm text-ink-gray-6"
            @click="autoScroll = !autoScroll"
          >
            Auto-scroll
          </button>
        </div>
        <div class="flex justify-end gap-2">
          <Button
            v-if="task.logs.length > 0"
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
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Badge, Button, Dialog, LoadingIndicator, Switch, toast } from 'frappe-ui';
import IconCopy from '~icons/lucide/copy';
import IconTerminal from '~icons/lucide/terminal';
import type { ProgressTaskSummary } from '../../controllers/progress';
import type { TaskProgressEvent } from '../../../shared/domain/task-runner';
import { statusTheme } from '../../utils/format';
import TaskTimer from '../ui/TaskTimer.vue';

const props = defineProps<{
  task: ProgressTaskSummary | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const logsContainer = ref<HTMLElement | null>(null);
const copied = ref(false);
const MAX_RENDERED_LOGS = 400;

const LOCAL_STORAGE_KEY = 'local-bench:task-log-auto-scroll';
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

const visibleLogs = computed(() => props.task?.logs.slice(-MAX_RENDERED_LOGS) ?? []);
const hiddenLogCount = computed(() => Math.max(0, (props.task?.logs.length ?? 0) - visibleLogs.value.length));

const formattedStatus = computed(() => {
  if (!props.task) return '';

  if (isBusy.value) {
    const name = String(props.task.taskName ?? '').toLowerCase();
    if (name.includes('create bench') || name.includes('create site')) return 'Creating';
    if (name.includes('stop site') || name.includes('stop bench')) return 'Stopping';
    if (name.includes('start site') || name.includes('start bench')) return 'Starting';
    if (name.includes('restart bench') || name.includes('restart site')) return 'Restarting';
    if (name.includes('delete site') || name.includes('delete bench')) return 'Deleting';
    if (name.includes('clean bench')) return 'Cleaning';

    return typeof props.task.stepName === 'string' && props.task.stepName.length > 0
      ? props.task.stepName.replace(/\.\.\./g, '')
      : 'Processing';
  }

  if (props.task.status === 'success') return 'Success';
  if (props.task.status === 'failure') {
    const message = String(props.task.message ?? '').toLowerCase();
    if (message.includes('cancelled')) return 'Cancelled';
    if (message.includes('timed out')) return 'Timed out';
    return 'Failed';
  }

  return props.task.status || 'Unknown';
});

const statusThemeValue = computed(() => statusTheme(props.task?.status || ''));

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

const levelClass = (level: TaskProgressEvent['logLevel']) => {
  if (level === 'error') return 'text-ink-red-2';
  if (level === 'warning') return 'text-ink-amber-3';
  if (level === 'info') return 'text-ink-blue-2';
  return 'text-ink-gray-4';
};

const messageClass = (level: TaskProgressEvent['logLevel']) => {
  if (level === 'error') return 'text-ink-red-2';
  if (level === 'warning') return 'text-ink-amber-2';
  return '';
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
  () => props.task?.logs.length,
  async () => {
    if (!autoScroll.value) return;
    await nextTick();
    scrollToBottom();
  }
);

const onCopyLogs = async () => {
  if (!props.task?.logs.length || copied.value) return;

  const text = props.task.logs
    .map((log) => `[${formatTime(log.timestamp)}] [${formatLevel(log.level)}] ${log.message}`)
    .join('\n');

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
</script>

<style scoped>
.task-log-output,
.task-log-output * {
  user-select: text !important;
  -webkit-user-select: text !important;
  -webkit-app-region: no-drag;
}
</style>
