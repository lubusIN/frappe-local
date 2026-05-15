<template>
  <Dialog
    v-if="task"
    v-model="isOpen"
    :options="{ size: '5xl' }"
  >
    <template #body-title>
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <h3 class="m-0 text-base font-semibold truncate text-ink-gray-9">
            {{ task.taskName }}

            <Badge
              variant="subtle"
              :theme="statusTheme"
            >
              {{ formattedStatus }}
              <LoadingIndicator
                v-if="isBusy"
                class="h-2.5 w-2.5"
              />
            </Badge>
          </h3>
          <p class="mt-1 text-[11px] text-ink-gray-5">
            Verbose logs from background orchestration tasks.
          </p>
        </div>
      </div>
    </template>

    <template #body-content>
      <div
        ref="logsContainer"
        class="selectable-text max-h-[58vh] overflow-y-auto rounded-lg border border-outline-gray-3 bg-surface-gray-7 p-4 font-mono text-[13px] leading-relaxed text-ink-gray-5"
      >
        <div
          v-if="task.logs.length === 0"
          class="py-10 text-center text-ink-gray-4"
        >
          No log entries yet...
        </div>
        <div
          v-for="(log, index) in task.logs"
          :key="index"
          class="flex gap-3 mb-1"
        >
          <time class="min-w-[74px] shrink-0 text-ink-gray-4">{{ formatTime(log.timestamp) }}</time>
          <span
            class="break-words whitespace-pre-wrap"
            :class="log.level === 'error' ? 'text-ink-red-2' : log.level === 'warning' ? 'text-ink-amber-3' : ''"
          >{{ log.message }}</span>
        </div>
      </div>
    </template>

    <template #actions>
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
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Badge, Button, Dialog, LoadingIndicator, toast } from 'frappe-ui';
import IconCopy from '~icons/lucide/copy';
import type { ProgressTaskSummary } from '../progress-center';

const props = defineProps<{
  task: ProgressTaskSummary | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const logsContainer = ref<HTMLElement | null>(null);
const copied = ref(false);

const isOpen = computed({
  get: () => Boolean(props.task),
  set: (value: boolean) => {
    if (!value) {
      emit('close');
    }
  },
});

const isBusy = computed(() => props.task?.status === 'running' || props.task?.status === 'queued');

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

const statusTheme = computed(() => {
  if (!props.task) return 'gray';
  if (props.task.status === 'success') return 'green';
  if (props.task.status === 'failure') return 'red';
  if (isBusy.value) return 'blue';
  return 'gray';
});

const formatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

watch(
  () => props.task?.logs.length,
  async () => {
    await nextTick();
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    }
  }
);

const onCopyLogs = async () => {
  if (!props.task?.logs.length || copied.value) return;

  const text = props.task.logs
    .map((log) => `[${formatTime(log.timestamp)}] ${log.message}`)
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
