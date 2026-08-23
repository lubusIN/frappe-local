<template>
  <div class="flex flex-col">
    <div
      class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none transition-colors sticky top-0 z-10"
      :class="[ isExpanded ? 'bg-surface-gray-2 font-medium text-ink-gray-9 border-b border-outline-gray-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-surface-base hover:bg-surface-gray-1 text-ink-gray-8' ]"
      @click="$emit('toggle')"
    >
      <div class="flex items-center min-w-0 gap-2.5">
        <i
          v-if="isExpanded"
          class="lucide-chevron-down size-4 shrink-0 text-ink-gray-5 transition-transform"
        />
        <i
          v-else
          class="lucide-chevron-right size-4 shrink-0 text-ink-gray-5 transition-transform"
        />

        <span class="flex items-center justify-center shrink-0">
          <i
            v-if="group.status === 'success'"
            class="lucide-check-circle-2 size-4 text-ink-green-5"
          />
          <LoadingIndicator
            v-else-if="group.status === 'running'"
            class="size-3.5 text-ink-blue-5"
          />
          <i
            v-else-if="group.status === 'failure'"
            class="lucide-x-circle size-4 text-ink-red-5"
          />
          <i
            v-else
            class="lucide-circle size-4 text-ink-gray-4"
          />
        </span>

        <span class="text-xs-medium truncate">{{ group.name }}</span>

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
          :color-class="group.status === 'failure' ? 'text-ink-red-5 font-semibold' : 'text-ink-gray-5'"
        />
      </div>
    </div>

    <div
      v-if="isExpanded"
      class="bg-surface-base py-1.5 overflow-x-auto font-mono text-xs leading-5 cursor-text select-text"
    >
      <TaskLogLine
        v-for="log in group.displayLogs"
        :key="`${group.id}-${log.lineNumber}`"
        :log="log"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Badge, LoadingIndicator } from 'frappe-ui';
import TaskTimer from '@frappe-local/renderer/components/ui/TaskTimer.vue';
import TaskLogLine from './TaskLogLine.vue';

import type { TaskLogLevel } from '@frappe-local/shared/domain';

interface StepGroup {
  id: string;
  name: string;
  status: 'running' | 'success' | 'failure' | 'skipped';
  startTime: string;
  endTime?: string;
  matchCount?: number;
  displayLogs: Array<{
    lineNumber: number;
    message: string;
    timestamp: string;
    logLevel: TaskLogLevel | null;
  }>;
}

defineProps<{
  group: StepGroup;
  isExpanded: boolean;
  isBusy: boolean;
  searchQuery: string;
}>();

defineEmits(['toggle']);
</script>
