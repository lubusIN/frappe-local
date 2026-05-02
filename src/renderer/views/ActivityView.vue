<template>
  <div class="activity-view">
    <!-- Toolbar: filters -->
    <header class="activity-toolbar">
      <div class="activity-filters">
        <div class="filter-item">
          <span class="filter-label">Status</span>
          <Select
            v-model="statusFilterModel"
            size="sm"
            variant="subtle"
            :options="statusOptions"
            placeholder="Status"
            class="filter-select"
          />
        </div>
        <div class="filter-item">
          <span class="filter-label">Resource</span>
          <Select
            v-model="resourceFilterModel"
            size="sm"
            variant="subtle"
            :options="resourceOptions"
            placeholder="Resource"
            class="filter-select"
          />
        </div>
        <div class="filter-item filter-item--switch">
          <Switch v-model="recentOnlyModel" size="sm" label="Recent 24h" />
        </div>
      </div>
    </header>

    <!-- Loading state -->
    <div
      v-if="progressLoading"
      class="state-panel state-panel--loading"
    >
      <LoadingIndicator class="mr-2 size-4" />
      <span>Subscribing to task stream…</span>
    </div>

    <!-- Error state -->
    <ErrorNotice
      v-else-if="errorNotice"
      :notice="errorNotice"
      tone="warning"
      @action="retryProgressSubscription"
      class="error-notice"
    />

    <!-- ListView -->
    <div v-else class="activity-list-container">
      <ListView
        :columns="activityColumns"
        :rows="activityRows"
        row-key="taskId"
        :options="activityListOptions"
      >
        <template #default>
          <ListHeader class="activity-list-header" />
          <ListRows v-if="activityRows.length" class="activity-list-rows" />
          <ListEmptyState v-else class="activity-list-empty" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'status'">
            <Badge
              :label="row.status"
              :theme="statusTheme(row.status)"
              size="md"
              variant="subtle"
            />
          </template>
          <template v-else-if="column.key === 'resource'">
            <Badge
              :label="row.resource"
              theme="gray"
              size="md"
              variant="outline"
              class="resource-badge"
            />
          </template>
          <template v-else-if="column.key === 'timestamp'">
            <span class="cell-text cell-text--muted tabular-nums">{{ formatTime(row.timestamp) }}</span>
          </template>
          <template v-else-if="column.key === 'taskName'">
            <span class="cell-text cell-text--bold truncate">{{ row.taskName }}</span>
          </template>
          <template v-else-if="column.key === 'message'">
            <span class="cell-text cell-text--secondary truncate">{{ row.message }}</span>
          </template>
        </template>
      </ListView>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Badge, ListView, ListHeader, ListRows, ListEmptyState, LoadingIndicator, Select, Switch } from 'frappe-ui';
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
  { label: 'Queued', value: 'queued' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
];

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

const activityColumns = [
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'resource', label: 'Resource', width: '120px' },
  { key: 'taskName', label: 'Task', width: 'minmax(160px, 1fr)' },
  { key: 'message', label: 'Message', width: 'minmax(240px, 2fr)' },
  { key: 'timestamp', label: 'Updated', width: '160px' },
];

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
  showTooltip: false,
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
  gap: 16px;
}

.activity-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.activity-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.filter-select {
  width: 160px;
}

.filter-item--switch {
  margin-left: 12px;
}

.activity-list-container {
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.state-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.state-panel--loading {
  color: var(--text-secondary);
  font-size: 13px;
}

.cell-text {
  font-size: 13px;
  line-height: 1.4;
}

.cell-text--bold {
  font-weight: 500;
  color: var(--text-primary);
}

.cell-text--secondary {
  color: var(--text-secondary);
}

.cell-text--muted {
  color: var(--text-muted);
}

.resource-badge {
  text-transform: capitalize;
}

/* ListView Overrides to match design system */
.activity-list-header {
  background-color: var(--surface-subtle) !important;
  border-bottom: 1px solid var(--border-light) !important;
  margin-bottom: 0 !important;
  padding: 10px 16px !important;
  border-radius: 0 !important;
}

.activity-list-rows {
  padding: 0 !important;
}

:deep(.frappe-list-row) {
  border-bottom: 1px solid var(--border-light) !important;
  padding: 0 16px !important;
  transition: background-color 100ms ease;
  height: 46px !important;
}

:deep(.frappe-list-row:last-child) {
  border-bottom: none !important;
}

:deep(.frappe-list-row:hover) {
  background-color: var(--surface-hover) !important;
}

.activity-list-empty {
  padding: 80px 20px !important;
  background: var(--surface-card);
}

.activity-list-empty :deep(div:first-child) {
  font-size: 16px !important;
  font-weight: 600 !important;
  color: var(--text-primary) !important;
  margin-top: 0 !important;
}

.activity-list-empty :deep(div:nth-child(2)) {
  font-size: 13px !important;
  color: var(--text-secondary) !important;
  margin-top: 4px !important;
}
</style>
