<template>
  <div class="dashboard">
    <section class="dashboard-section">
      <h2 class="section-title">System Health</h2>
      <div class="card-row">
        <div class="health-card" :class="healthCardClass">
          <p class="card-eyebrow">App Health</p>
          <p v-if="loading" class="card-value muted">Checking…</p>
          <p v-else-if="error" class="card-value error">Unavailable</p>
          <p v-else-if="health" class="card-value ok">{{ health.appName }}</p>
          <p v-else class="card-value muted">—</p>
          <ul v-if="health" class="card-meta">
            <li>Platform: <strong>{{ health.platform }}</strong></li>
            <li>Electron: <strong>{{ health.electronVersion }}</strong></li>
            <li>Node: <strong>{{ health.nodeVersion }}</strong></li>
          </ul>
          <p v-if="error" class="card-error">{{ error }}</p>
        </div>
      </div>
      <RuntimeHealthPanel
        :health="runtimeHealth"
        :loading="runtimeLoading"
        :repairing="runtimeRepairing"
        :error="runtimeError"
        :active-task-status="runtimeTaskStatus"
        :last-task-message="runtimeTaskMessage"
        :repair-logs="runtimeLogs"
        @refresh="refreshRuntimeHealth"
        @repair="repairRuntime"
      />
    </section>

    <section class="dashboard-section">
      <h2 class="section-title">Quick Actions</h2>
      <div class="card-row">
        <RouterLink to="/benches" class="action-card">
          <p class="card-eyebrow">Benches</p>
          <p class="card-label">Manage environments</p>
        </RouterLink>
        <RouterLink to="/sites" class="action-card">
          <p class="card-eyebrow">Sites</p>
          <p class="card-label">Manage local sites</p>
        </RouterLink>
        <RouterLink to="/settings" class="action-card">
          <p class="card-eyebrow">Settings</p>
          <p class="card-label">Configure preferences</p>
        </RouterLink>
      </div>
    </section>

    <section class="dashboard-section">
      <h2 class="section-title">Progress Center</h2>
      <TaskProgressCenter
        :items="filteredTasks"
        :loading="progressLoading"
        :error="progressError"
        :statusFilter="progressStatusFilter"
        :resourceFilter="progressResourceFilter"
        :recentOnly="progressRecentOnly"
        @update:statusFilter="(value) => (progressStatusFilter.value = value)"
        @update:resourceFilter="(value) => (progressResourceFilter.value = value)"
        @update:recentOnly="(value) => (progressRecentOnly.value = value)"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import RuntimeHealthPanel from '../components/RuntimeHealthPanel.vue';
import TaskProgressCenter from '../components/TaskProgressCenter.vue';
import { useAppHealth } from '../composables/useAppHealth';
import { useProgressCenter } from '../composables/useProgressCenter';
import { useRuntimeHealth } from '../composables/useRuntimeHealth';

const { health, loading, error } = useAppHealth();
const {
  health: runtimeHealth,
  loading: runtimeLoading,
  repairing: runtimeRepairing,
  error: runtimeError,
  activeTaskStatus: runtimeTaskStatus,
  lastTaskMessage: runtimeTaskMessage,
  repairLogs: runtimeLogs,
  refresh: refreshRuntimeHealth,
  repair: repairRuntime,
} = useRuntimeHealth();

const {
  filteredTasks,
  loading: progressLoading,
  error: progressError,
  statusFilter,
  resourceFilter,
  recentOnly,
} = useProgressCenter();

const progressStatusFilter = computed({
  get: () => statusFilter.value,
  set: (value: 'all' | 'queued' | 'running' | 'success' | 'failure') => {
    statusFilter.value = value;
  },
});

const progressResourceFilter = computed({
  get: () => resourceFilter.value,
  set: (value: 'all' | 'bench' | 'site' | 'import' | 'runtime' | 'system') => {
    resourceFilter.value = value;
  },
});

const progressRecentOnly = computed({
  get: () => recentOnly.value,
  set: (value: boolean) => {
    recentOnly.value = value;
  },
});

const healthCardClass = computed(() => {
  if (loading.value) return 'health-card--loading';
  if (error.value) return 'health-card--error';
  if (health.value) return 'health-card--ok';
  return '';
});
</script>