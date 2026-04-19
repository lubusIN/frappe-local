<template>
  <section class="progress-center" aria-live="polite">
    <header class="progress-header">
      <div>
        <p class="progress-eyebrow">Unified Progress</p>
        <h3 class="progress-title">Task Activity</h3>
      </div>
      <div class="progress-filters">
        <label>
          <span>Status</span>
          <select :value="statusFilter" @change="onStatusChange">
            <option value="all">All</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </label>
        <label>
          <span>Resource</span>
          <select :value="resourceFilter" @change="onResourceChange">
            <option value="all">All</option>
            <option value="bench">Bench</option>
            <option value="site">Site</option>
            <option value="import">Import/Export</option>
            <option value="runtime">Runtime</option>
            <option value="system">System</option>
          </select>
        </label>
        <label class="recent-toggle">
          <input type="checkbox" :checked="recentOnly" @change="onRecentToggle" />
          <span>Recent 24h</span>
        </label>
      </div>
    </header>

    <p v-if="loading" class="progress-empty">Subscribing to task stream…</p>
    <ErrorNotice
      v-else-if="errorNotice"
      :notice="errorNotice"
      tone="warning"
      @action="$emit('retrySubscription')"
    />
    <p v-else-if="items.length === 0" class="progress-empty">No matching tasks yet.</p>

    <ul v-else class="progress-list">
      <li v-for="item in items" :key="item.taskId" class="progress-item">
        <div class="progress-meta">
          <span class="pill" :class="`pill--${item.status}`">{{ item.status }}</span>
          <span class="resource">{{ item.resource }}</span>
          <time :datetime="item.timestamp">{{ formatTime(item.timestamp) }}</time>
        </div>
        <p class="task-name">{{ item.taskName }}</p>
        <p class="task-message">{{ item.message }}</p>
        <RouterLink class="task-link" :to="taskRoute(item)">Open related view</RouterLink>
      </li>
    </ul>
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
  border: 1px solid #e4e9ef;
  border-radius: 12px;
  padding: 14px;
  background: #ffffff;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.progress-eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.progress-title {
  margin: 2px 0 0;
  font-size: 1rem;
  color: #1f272e;
}

.progress-filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.progress-filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  color: #64748b;
}

.progress-filters select {
  min-width: 120px;
  min-height: 32px;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
}

.progress-filters select:focus-visible {
  outline: none;
  border-color: #7aa2f7;
  box-shadow: 0 0 0 3px rgba(122, 162, 247, 0.2);
}

.recent-toggle {
  justify-content: flex-end;
  flex-direction: row !important;
  align-items: center;
  gap: 6px !important;
}

.recent-toggle input {
  accent-color: #2563eb;
}

.progress-empty,
.progress-error {
  margin: 14px 0 0;
  color: #64748b;
}

.progress-error {
  color: #b42318;
}

.progress-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.progress-item {
  border: 1px solid #e4e9ef;
  border-radius: 10px;
  background: #f8fafc;
  padding: 10px;
}

.progress-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: #64748b;
}

.pill {
  padding: 2px 8px;
  border-radius: 999px;
  text-transform: capitalize;
  font-weight: 600;
  border: 1px solid transparent;
}

.pill--queued {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #475569;
}

.pill--running {
  background: #eaf2ff;
  border-color: #d3e2ff;
  color: #1e3a8a;
}

.pill--success {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.pill--failure {
  background: #fff7f7;
  border-color: #fecaca;
  color: #b42318;
}

.task-name {
  margin: 6px 0 0;
  font-weight: 600;
  color: #1f272e;
}

.task-message {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.task-link {
  margin-top: 6px;
  display: inline-block;
  font-size: 0.82rem;
  color: #1e3a8a;
}

.task-link:hover {
  color: #1e40af;
}

.task-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(122, 162, 247, 0.24);
  border-radius: 4px;
}

@media (max-width: 760px) {
  .progress-header {
    flex-direction: column;
  }

  .progress-filters label {
    width: 100%;
  }

  .progress-filters select {
    min-width: 0;
  }
}
</style>
