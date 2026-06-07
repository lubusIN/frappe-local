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
          <span class="block truncate text-xs tabular-nums text-ink-gray-5">{{ formatTime(row.timestamp) }}</span>
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
          <span
            v-else
            class="text-xs text-ink-gray-5"
          >-</span>
        </template>
        <template v-else-if="column.key === 'taskName'">
          <span class="block truncate text-sm font-medium text-ink-gray-9">{{ row.taskName }}</span>
        </template>
        <template v-else-if="column.key === 'message'">
          <span class="block truncate text-sm text-ink-gray-6">{{ row.message }}</span>
        </template>
      </template>
    </ResourceListView>

    <TaskLogDialog
      v-if="selectedTask"
      :task="selectedTask"
      @close="selectedTask = null"
    />

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
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { Badge, LoadingIndicator, Select } from 'frappe-ui';
import IconTrash from '~icons/lucide/trash-2';
import ConfirmationDialog from '../components/dialogs/ConfirmationDialog.vue';
import ErrorNotice from '../components/ui/ErrorNotice.vue';
import ResourceListView from '../components/ui/ResourceListView.vue';
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
      icon: IconTrash,
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
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'resource', label: 'Resource', width: '120px' },
  { key: 'taskName', label: 'Task', width: 'minmax(160px, 1fr)' },
  { key: 'message', label: 'Message', width: 'minmax(240px, 2fr)' },
  { key: 'timestamp', label: 'Updated', width: '100px' },
  { key: 'elapsed', label: 'Elapsed', width: '120px' },
] satisfies object[];

const activityRows = computed(() => filteredTasks.value);

const onActivityRowClick = (row: object) => {
  selectedTask.value = row as ProgressTaskSummary;
};

const errorNotice = computed(() =>
  progressError.value ? buildErrorRemediationNotice('progress', progressError.value) : null
);

</script>
