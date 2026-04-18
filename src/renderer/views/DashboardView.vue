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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppHealth } from '../composables/useAppHealth';

const { health, loading, error } = useAppHealth();

const healthCardClass = computed(() => {
  if (loading.value) return 'health-card--loading';
  if (error.value) return 'health-card--error';
  if (health.value) return 'health-card--ok';
  return '';
});
</script>