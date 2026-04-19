<template>
  <section class="progress-center" aria-live="polite">
    <div class="progress-filters">
      <div class="filter-group">
        <label class="filter-label">Status</label>
        <select :value="statusFilter" class="filter-select" @change="onStatusChange">
          <option value="all">All</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Resource</label>
        <select :value="resourceFilter" class="filter-select" @change="onResourceChange">
          <option value="all">All</option>
          <option value="bench">Bench</option>
          <option value="site">Site</option>
          <option value="import">Import/Export</option>
          <option value="runtime">Runtime</option>
          <option value="system">System</option>
        </select>
      </div>
      <label class="recent-toggle">
        <input type="checkbox" :checked="recentOnly" @change="onRecentToggle" />
        <span>Recent 24h</span>
      </label>
    </div>

    <p v-if="loading" class="progress-empty">Subscribing to task stream…</p>
    <ErrorNotice
      v-else-if="errorNotice"
      :notice="errorNotice"
      tone="warning"
      @action="$emit('retrySubscription')"
    />
    <p v-else-if="items.length === 0" class="progress-empty">No matching tasks yet.</p>

    <div v-else class="progress-list">
      <div v-for="item in items" :key="item.taskId" class="progress-item">
        <div class="progress-item__header">
          <div class="progress-item__meta">
            <span class="status-pill" :class="`status-pill--${item.status}`">{{ item.status }}</span>
            <span class="resource-badge">{{ item.resource }}</span>
          </div>
          <time class="progress-item__time" :datetime="item.timestamp">{{ formatTime(item.timestamp) }}</time>
        </div>
        <div class="progress-item__body">
          <p class="task-name">{{ item.taskName }}</p>
          <p class="task-message">{{ item.message }}</p>
        </div>
        <div class="progress-item__footer">
          <RouterLink class="task-link" :to="taskRoute(item)">Open context &rarr;</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, toRefs } from 'vue';
import { RouterLink } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
import ErrorNotice from './ErrorNotice.vue';
import { buildErrorRemediationNotice } from '../error-remediation';
import type { ProgressTaskResource, ProgressTaskSummary } from '../progress-center';

const props = defineProps<{
  items: ProgressTaskSummary[];
  loading: boolean;
  error: string | null;
  statusFilter: 'all' | 'queued' | 'running' | 'success' | 'failure';
  resourceFilter: 'all' | ProgressTaskResource;
  recentOnly: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:statusFilter', value: 'all' | 'queued' | 'running' | 'success' | 'failure'): void;
  (event: 'update:resourceFilter', value: 'all' | ProgressTaskResource): void;
  (event: 'update:recentOnly', value: boolean): void;
  (event: 'retrySubscription'): void;
}>();

const onStatusChange = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value as
    | 'all'
    | 'queued'
    | 'running'
    | 'success'
    | 'failure';
  emit('update:statusFilter', value);
};

const onResourceChange = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value as 'all' | ProgressTaskResource;
  emit('update:resourceFilter', value);
};

const onRecentToggle = (event: Event): void => {
  const value = (event.target as HTMLInputElement).checked;
  emit('update:recentOnly', value);
};

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
    return { path: '/dashboard', query: item.resourceId ? { runtime: item.resourceId } : {} };
  }

  return { path: '/dashboard' };
};

const formatTime = (value: string): string => new Date(value).toLocaleString();

const { statusFilter, resourceFilter, recentOnly } = toRefs(props);
const errorNotice = computed(() =>
  props.error ? buildErrorRemediationNotice('progress-center', props.error) : null
);
</script>

<style scoped>
.progress-center {
  display: grid;
  gap: 16px;
}

.progress-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.filter-select {
  min-width: 120px;
  min-height: 32px;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
}

.recent-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.progress-empty {
  margin: 0;
  padding: 24px;
  text-align: center;
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.progress-list {
  display: grid;
  gap: 12px;
}

.progress-item {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  display: flex;
  flex-direction: column;
}

.progress-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--surface-subtle);
  border-radius: 8px 8px 0 0;
}

.progress-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-item__time {
  font-size: 12px;
  color: var(--text-muted);
}

.status-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  text-transform: capitalize;
  background: var(--gray-light);
  color: var(--gray-text);
}

.status-pill--running {
  background: var(--blue-light);
  color: var(--blue-text);
}

.status-pill--success {
  background: var(--green-light);
  color: var(--green-text);
}

.status-pill--failure {
  background: var(--red-light);
  color: var(--red-text);
}

.resource-badge {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.progress-item__body {
  padding: 16px;
  display: grid;
  gap: 4px;
}

.task-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.task-message {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.progress-item__footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: flex-end;
}

.task-link {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-link);
  text-decoration: none;
}

.task-link:hover {
  color: var(--text-link-hover);
  text-decoration: underline;
}

@media (max-width: 760px) {
  .progress-filters {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
