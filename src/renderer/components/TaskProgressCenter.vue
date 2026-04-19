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
    <p v-else-if="error" class="progress-error">{{ error }}</p>
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
        <RouterLink class="task-link" :to="taskRoute(item.resource)">Open related view</RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
import { RouterLink } from 'vue-router';
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

const taskRoute = (resource: ProgressTaskResource): string => {
  if (resource === 'bench') return '/benches';
  if (resource === 'site') return '/sites';
  if (resource === 'import') return '/import-export';
  if (resource === 'runtime') return '/dashboard';
  return '/dashboard';
};

const formatTime = (value: string): string => new Date(value).toLocaleString();

const { statusFilter, resourceFilter, recentOnly } = toRefs(props);
</script>

<style scoped>
.progress-center {
  border: 1px solid rgba(99, 115, 129, 0.35);
  border-radius: 14px;
  padding: 16px;
  background: linear-gradient(170deg, rgba(228, 238, 250, 0.55), rgba(246, 248, 252, 0.95));
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
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #2f4b6c;
}

.progress-title {
  margin: 2px 0 0;
  font-size: 1rem;
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
  color: #425466;
}

.progress-filters select {
  min-width: 120px;
}

.recent-toggle {
  justify-content: flex-end;
  flex-direction: row !important;
  align-items: center;
  gap: 6px !important;
}

.progress-empty,
.progress-error {
  margin: 14px 0 0;
  color: #5c6d7e;
}

.progress-error {
  color: #8f1f1f;
}

.progress-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.progress-item {
  border: 1px solid rgba(99, 115, 129, 0.24);
  border-radius: 10px;
  background: #fff;
  padding: 10px;
}

.progress-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: #5c6d7e;
}

.pill {
  padding: 2px 8px;
  border-radius: 999px;
  text-transform: capitalize;
  font-weight: 600;
}

.pill--queued {
  background: #e8eef5;
}

.pill--running {
  background: #e7f2ff;
}

.pill--success {
  background: #e7f8ef;
}

.pill--failure {
  background: #ffeceb;
}

.task-name {
  margin: 6px 0 0;
  font-weight: 600;
}

.task-message {
  margin: 4px 0 0;
  color: #506173;
  font-size: 0.9rem;
}

.task-link {
  margin-top: 6px;
  display: inline-block;
  font-size: 0.82rem;
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
