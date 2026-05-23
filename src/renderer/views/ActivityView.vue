<template>
  <div class="flex flex-col">
    <div class="mb-6 flex items-center gap-4 justify-start">
      <Select
        v-model="statusFilterModel"
        class="!w-auto"
        :options="statusOptions"
        variant="outline"
      />
      <Select
        v-model="resourceFilterModel"
        class="!w-auto"
        :options="resourceOptions"
        variant="outline"
      />
    </div>

    <!-- Loading state -->
    <div
      v-if="progressLoading"
      class="flex items-center justify-center p-12 text-ink-gray-5 text-sm"
    >
      <LoadingIndicator class="mr-2 w-4 h-4" />
      <span>Subscribing to task stream…</span>
    </div>

    <!-- Error state -->
    <ErrorNotice
      v-else-if="errorNotice"
      :notice="errorNotice"
      tone="warning"
      class="mb-4"
      @action="retryProgressSubscription"
    />

    <!-- ListView -->
    <ListView
      v-else
      :columns="activityColumns"
      :rows="activityRows"
      row-key="taskId"
      :options="activityListOptions"
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'status'">
          <Badge
            :theme="statusTheme(row.status)"
            size="md"
            variant="subtle"
          >
            {{ formatStatus(row.status) }}
          </Badge>
        </template>
        <template v-else-if="column.key === 'resource'">
          <Badge
            theme="gray"
            size="md"
            variant="outline"
            class="capitalize"
          >
            {{ row.resource }}
          </Badge>
        </template>
        <template v-else-if="column.key === 'timestamp'">
          <span class="text-xs text-ink-gray-5 tabular-nums">{{ formatTime(row.timestamp) }}</span>
        </template>
        <template v-else-if="column.key === 'elapsed'">
          <TaskTimer
            v-if="row.logs && row.logs.length > 0"
            :start-time="row.logs[0].timestamp"
            :end-time="row.logs[row.logs.length - 1].timestamp"
            :running="row.status === 'running' || row.status === 'queued'"
            size-class="text-xs"
            color-class="text-ink-gray-5 tabular-nums"
          />
          <span v-else class="text-xs text-ink-gray-5">-</span>
        </template>
        <template v-else-if="column.key === 'taskName'">
          <span class="text-sm font-medium text-ink-gray-9 truncate">{{ row.taskName }}</span>
        </template>
        <template v-else-if="column.key === 'message'">
          <span class="text-sm text-ink-gray-6 truncate">{{ row.message }}</span>
        </template>
      </template>
    </ListView>

    <TaskLogDialog
      v-if="selectedTask"
      :task="selectedTask"
      @close="selectedTask = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import { Badge, ListView, LoadingIndicator, Select } from 'frappe-ui';
import IconTrash from '~icons/lucide/trash-2';
import ErrorNotice from '../components/ui/ErrorNotice.vue';
import TaskLogDialog from '../components/dialogs/TaskLogDialog.vue';
import TaskTimer from '../components/ui/TaskTimer.vue';
import { useProgressCenter } from '../composables/system/useProgressCenter';
import { usePageHeaderActions } from '../composables/ui/usePageHeaderActions';
import { buildErrorRemediationNotice } from '../utils/error-remediation';
import { formatStatus, formatTime, statusTheme } from '../utils/format';
import type { ProgressTaskSummary } from '../controllers/progress';

const {
  filteredTasks,
  loading: progressLoading,
  error: progressError,
  statusFilter,
  resourceFilter,
  reconnect,
  clearTasks,
} = useProgressCenter();

const { setActions, clearActions } = usePageHeaderActions();
const selectedTask = ref<ProgressTaskSummary | null>(null);

const headerActions = computed(() => {
  if (filteredTasks.value.length === 0) return [];
  return [
    {
      id: 'activity-clear',
      label: 'Clear',
      icon: IconTrash,
      theme: 'red',
      variant: 'subtle' as const,
      onClick: () => {
        clearTasks();
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

const activityColumns = reactive([
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'resource', label: 'Resource', width: '120px' },
  { key: 'taskName', label: 'Task', width: 'minmax(160px, 1fr)' },
  { key: 'message', label: 'Message', width: 'minmax(240px, 2fr)' },
  { key: 'timestamp', label: 'Updated', width: '100px' },
  { key: 'elapsed', label: 'Elapsed', width: '120px' },
]);

const activityRows = computed(() => filteredTasks.value);

const activityListOptions = computed(() => ({
  selectable: false,
  showTooltip: true,
  resizeColumn: true,
  rowHeight: '46px',
  onRowClick: (row: ProgressTaskSummary) => {
    selectedTask.value = row;
  },
  emptyState: {
    title: 'No Activity',
    description: 'No background tasks or recent activity found.',
  },
}));

const errorNotice = computed(() =>
  progressError.value ? buildErrorRemediationNotice('progress', progressError.value) : null
);

</script>
