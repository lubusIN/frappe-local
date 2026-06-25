<template>
  <section class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center gap-3">
      <Select
        v-model="statusFilterModel"
        class="min-w-36 flex-none"
        :options="statusOptions"
        variant="outline"
      />
      <Select
        v-model="resourceFilterModel"
        class="min-w-36 flex-none"
        :options="resourceOptions"
        variant="outline"
      />
    </div>

    <div
      v-if="progressLoading"
      class="flex items-center justify-center p-12 text-sm text-ink-gray-5"
    >
      <LoadingIndicator class="mr-2 h-4 w-4" />
      <span>Subscribing to task stream…</span>
    </div>

    <ErrorNotice
      v-else-if="errorNotice"
      :notice="errorNotice"
      tone="warning"
      @action="retryProgressSubscription"
    />

    <EmptyState
      v-else-if="activityRows.length === 0"
      title="No activity"
      description="No background tasks or recent activity match the current filters."
      :icon="IconActivity"
    />

    <ResourceListView
      v-else
      :columns="activityColumns"
      :rows="activityRows"
      row-key="taskId"
      empty-title="No activity"
      empty-description="No background tasks or recent activity found."
      :on-row-click="onActivityRowClick"
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'task'">
          <div class="min-w-0 max-w-[520px]">
            <div class="flex min-w-0 items-center gap-2">
              <Badge
                theme="gray"
                size="md"
                variant="outline"
                class="shrink-0 capitalize"
              >
                {{ row.resource }}
              </Badge>
              <span class="truncate text-sm text-ink-gray-9">{{ row.taskName }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="column.key === 'state'">
          <Badge
            :theme="statusTheme(row.status, 'task')"
            size="md"
            variant="subtle"
          >
            {{ formatStatus(row.status, 'task') }}
          </Badge>
        </template>

        <template v-else-if="column.key === 'timing'">
          <div class="flex min-w-0 flex-col gap-1">
            <span
              class="truncate text-xs tabular-nums text-ink-gray-5"
              :title="formatFullActivityTime(row.timestamp)"
            >
              {{ formatActivityTime(row.timestamp) }}
            </span>
            <Badge
              v-if="row.logs && row.logs.length > 0"
              :theme="row.status === 'running' || row.status === 'queued' ? 'blue' : 'gray'"
              variant="subtle"
              size="md"
              class="w-fit"
            >
              <TaskTimer
                :start-time="row.logs[0].timestamp"
                :end-time="row.logs[row.logs.length - 1].timestamp"
                :running="row.status === 'running' || row.status === 'queued'"
                :show-label="false"
                size-class="text-xs"
                color-class="tabular-nums"
              />
            </Badge>
            <span
              v-else
              class="text-xs text-ink-gray-5"
            >-</span>
          </div>
        </template>
      </template>
    </ResourceListView>

    <ConfirmationDialog
      :open="showClearConfirm"
      title="Clear Activities"
      message="Are you sure you want to clear all activity history? This action cannot be undone."
      @confirm="onConfirmClear"
      @cancel="showClearConfirm = false"
    />
  </section>
</template>

<script setup lang="ts">
import { Badge, LoadingIndicator, Select } from 'frappe-ui';
import IconActivity from '~icons/lucide/activity';
import IconTrash2 from '~icons/lucide/trash2';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import ErrorNotice from '@frappe-local/renderer/components/ui/ErrorNotice.vue';
import ResourceListView from '@frappe-local/renderer/components/ui/ResourceListView.vue';
import TaskTimer from '@frappe-local/renderer/components/ui/TaskTimer.vue';
import { useProgressCenter } from '@frappe-local/renderer/composables/system';
import { usePageHeaderActions } from '@frappe-local/renderer/composables/ui';
import { buildErrorRemediationNotice, formatStatus, statusTheme } from '@frappe-local/renderer/utils';

import type { ProgressTaskSummary } from '@frappe-local/renderer/controllers';

const {
  filteredTasks,
  loading: progressLoading,
  error: progressError,
  statusFilter,
  resourceFilter,
  clearTasks,
  activeLogTaskId,
} = useProgressCenter();

const { setActions, clearActions } = usePageHeaderActions();
const showClearConfirm = ref(false);

const onConfirmClear = () => {
  clearTasks();
  showClearConfirm.value = false;
};

const headerActions = computed(() => {
  if (filteredTasks.value.length === 0) return [];
  return [
    {
      id: 'activity-clear',
      label: 'Clear',
      icon: IconTrash2,
      theme: 'red',
      variant: 'subtle' as const,
      onClick: () => {
        showClearConfirm.value = true;
      },
    },
  ];
});

watch(headerActions, (actions) => {
  setActions(actions);
}, { immediate: true });

onBeforeUnmount(() => {
  clearActions();
});

const statusFilterModel = computed({
  get: () => statusFilter.value,
  set: (value: string) => {
    statusFilter.value = value as typeof statusFilter.value;
  },
});

const resourceFilterModel = computed({
  get: () => resourceFilter.value,
  set: (value: string) => {
    resourceFilter.value = value as typeof resourceFilter.value;
  },
});

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'In Progress', value: 'queued' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
];

const resourceOptions = [
  { label: 'All resources', value: 'all' },
  { label: 'Bench', value: 'bench' },
  { label: 'Site', value: 'site' },
  { label: 'Runtime', value: 'runtime' },
  { label: 'System', value: 'system' },
];

const retryProgressSubscription = async (): Promise<void> => {
  await reconnect();
};

const activityColumns = [
  { key: 'task', label: 'Activity', width: 'minmax(240px, 50%)' },
  { key: 'state', label: 'State', width: 'minmax(170px, 220px)' },
  { key: 'timing', label: 'Time', width: 'minmax(150px, 180px)' },
] satisfies object[];

const activityRows = computed(() => filteredTasks.value);

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const fullDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const startOfDay = (value: Date): number =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

const formatActivityTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const today = startOfDay(new Date());
  const itemDay = startOfDay(date);
  const dayDiff = Math.round((today - itemDay) / 86_400_000);
  const time = timeFormatter.format(date);

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  return dateTimeFormatter.format(date);
};

const formatFullActivityTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return fullDateTimeFormatter.format(date);
};

const onActivityRowClick = (row: object) => {
  activeLogTaskId.value = (row as ProgressTaskSummary).taskId;
};

const errorNotice = computed(() =>
  progressError.value ? buildErrorRemediationNotice('progress', progressError.value) : null
);

</script>
