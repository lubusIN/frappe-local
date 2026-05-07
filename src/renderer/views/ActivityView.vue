<template>
  <div class="activity-view">
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
        <template v-else-if="column.key === 'taskName'">
          <span class="text-sm font-medium text-ink-gray-9 truncate">{{ row.taskName }}</span>
        </template>
        <template v-else-if="column.key === 'message'">
          <span class="text-sm text-ink-gray-6 truncate">{{ row.message }}</span>
        </template>
      </template>
    </ListView>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Badge, ListView, LoadingIndicator, Select } from 'frappe-ui';
import type { RouteLocationRaw } from 'vue-router';
import ErrorNotice from '../components/ErrorNotice.vue';
import { useProgressCenter } from '../composables/useProgressCenter';
import { buildErrorRemediationNotice } from '../error-remediation';
import type { ProgressTaskSummary } from '../progress-center';

const {
  filteredTasks,
  loading: progressLoading,
  error: progressError,
  statusFilter,
  resourceFilter,
  reconnect,
} = useProgressCenter();

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

const formatStatus = (status: string): string => {
  if (status === 'queued') return 'In Progress';
  if (status === 'running') return 'Running';
  if (status === 'success') return 'Success';
  if (status === 'failure') return 'Failed';
  return status;
};

const resourceOptions = [
  { label: 'All resources', value: 'all' },
  { label: 'Bench', value: 'bench' },
  { label: 'Site', value: 'site' },
  { label: 'Runtime', value: 'runtime' },
  { label: 'System', value: 'system' },
];

const statusTheme = (
  status: string
): 'gray' | 'blue' | 'green' | 'red' | 'orange' => {
  const map: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'orange'> = {
    queued: 'gray',
    running: 'blue',
    success: 'green',
    failure: 'red',
  };
  return map[status] ?? 'gray';
};

const retryProgressSubscription = async (): Promise<void> => {
  await reconnect();
};

const activityColumns = reactive([
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'resource', label: 'Resource', width: '120px' },
  { key: 'taskName', label: 'Task', width: 'minmax(160px, 1fr)' },
  { key: 'message', label: 'Message', width: 'minmax(240px, 2fr)' },
  { key: 'timestamp', label: 'Updated', width: '160px' },
]);

const taskRoute = (item: ProgressTaskSummary): RouteLocationRaw => {
  if (item.resource === 'bench') {
    return item.resourceId
      ? { path: '/benches', query: { benchId: item.resourceId } }
      : { path: '/benches' };
  }

  if (item.resource === 'site') {
    return item.resourceId
      ? { path: '/sites', query: { siteId: item.resourceId } }
      : { path: '/sites' };
  }

  if (item.resource === 'runtime') {
    return { path: '/diagnostics' };
  }

  return { path: '/' };
};

const activityRows = computed(() => filteredTasks.value);

const activityListOptions = computed(() => ({
  selectable: false,
  showTooltip: true,
  resizeColumn: true,
  rowHeight: '46px',
  getRowRoute: (row: ProgressTaskSummary) => taskRoute(row),
  emptyState: {
    title: 'No Activity',
    description: 'No background tasks or recent activity found.',
  },
}));

const errorNotice = computed(() =>
  progressError.value ? buildErrorRemediationNotice('progress-center', progressError.value) : null
);

const formatTime = (value: string): string => new Date(value).toLocaleString();
</script>

<style scoped>
.activity-view {
  display: flex;
  flex-direction: column;
}
</style>
