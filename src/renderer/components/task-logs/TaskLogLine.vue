<template>
  <div class="grid grid-cols-[48px_minmax(0,1fr)] gap-3 px-4 py-0.5 hover:bg-surface-gray-1 transition-colors">
    <span
      class="text-right tabular-nums text-ink-gray-4 select-none pr-2.5 border-r border-outline-gray-2"
      :title="formatFullTime(log.timestamp)"
    >
      {{ log.lineNumber }}
    </span>
    <div class="min-w-0 break-words whitespace-pre-wrap flex items-start gap-2">
      <span
        v-if="log.logLevel && log.logLevel !== 'info'"
        class="shrink-0 uppercase text-[10px] font-semibold px-1 rounded-4 mt-0.5"
        :class="levelBadgeClass(log.logLevel)"
      >
        {{ log.logLevel }}
      </span>
      <span :class="messageClass(log.logLevel)">{{ log.message }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskLogLevel } from '@frappe-local/shared/domain';

defineProps<{
  log: {
    lineNumber: number;
    message: string;
    timestamp: string;
    logLevel: TaskLogLevel | null;
  };
}>();

const formatFullTime = (timestamp: string) => new Date(timestamp).toLocaleString();

const levelBadgeClass = (level: TaskLogLevel | null) => {
  if (level === 'error') return 'bg-surface-red-2 text-ink-red-5';
  if (level === 'warning') return 'bg-surface-amber-2 text-ink-amber-5';
  return 'bg-surface-gray-3 text-ink-gray-6';
};

const messageClass = (level: TaskLogLevel | null) => {
  if (level === 'error') return 'text-ink-red-4';
  if (level === 'warning') return 'text-ink-amber-4';
  return 'text-ink-gray-7';
};
</script>
