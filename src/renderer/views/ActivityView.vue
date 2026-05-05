<template>
  <div class="activity-view">
    <div class="flex gap-4 mb-6 items-center">
      <select v-model="statusFilterModel" class="p-2 border rounded text-sm bg-white min-w-[140px]">
        <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <select v-model="resourceFilterModel" class="p-2 border rounded text-sm bg-white min-w-[140px]">
        <option v-for="opt in resourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <div class="flex items-center ml-auto">
        <Switch v-model="recentOnlyModel" size="sm" label="Recent 24h" />
      </div>
    </div>

    <!-- Loading state -->
    <div
      v-if="progressLoading"
      class="flex items-center justify-center p-12 text-gray-500 text-sm"
    >
      <LoadingIndicator class="mr-2 w-4 h-4" />
      <span>Subscribing to task stream…</span>
    </div>

    <!-- Error state -->
    <ErrorNotice
      v-else-if="errorNotice"
      :notice="errorNotice"
      tone="warning"
      @action="retryProgressSubscription"
      class="mb-4"
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
          <span class="text-xs text-gray-500 tabular-nums">{{ formatTime(row.timestamp) }}</span>
        </template>
        <template v-else-if="column.key === 'taskName'">
          <span class="text-sm font-medium text-gray-900 truncate">{{ row.taskName }}</span>
        </template>
        <template v-else-if="column.key === 'message'">
          <span class="text-sm text-gray-600 truncate">{{ row.message }}</span>
        </template>
      </template>
    </ListView>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Badge, ListView, LoadingIndicator, Switch } from 'frappe-ui';
import type { RouteLocationRaw } from 'vue-router';
import ErrorNotice from '../components/ErrorNotice.vue';
import { useProgressCenter } from '../composables/useProgressCenter';
import { buildErrorRemediationNotice } from '../error-remediation';
import type { ProgressTaskResource, ProgressTaskSummary } from '../progress-center';

const {
  filteredTasks,
  loading: progressLoading,
  error: progressError,
  statusFilter,
  resourceFilter,
  recentOnly,
  reconnect,
} = useProgressCenter();

const statusFilterModel = computed({
  get: () => statusFilter.value,
  set: (value: string) => {
    statusFilter.value = value as 'all' | 'queued' | 'running' | 'success' | 'failure';
  },
});

const resourceFilterModel = computed({
  get: () => resourceFilter.value,
  set: (value: string) => {
    resourceFilter.value = value as 'all' | ProgressTaskResource;
  },
});

const recentOnlyModel = computed({
  get: () => recentOnly.value,
  set: (value: boolean) => {
    recentOnly.value = value;
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
  { label: 'Import / Export', value: 'import' },
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

  if (item.resource === 'import') {
    return { path: '/import-export' };
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
