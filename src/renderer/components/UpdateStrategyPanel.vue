<template>
  <section class="update-panel">
    <header class="update-panel__header">
      <div>
        <p class="card-eyebrow">Release channel</p>
        <h3 class="update-panel__title">Update strategy</h3>
      </div>
      <button type="button" class="update-panel__action" :disabled="loading || checking" @click="$emit('check')">
        {{ checking ? 'Checking…' : 'Check for updates' }}
      </button>
    </header>

    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load update strategy"
      :body="error"
      action-label="Retry"
      @action="$emit('refresh')"
    />

    <StatePanel
      v-else-if="loading"
      kind="loading"
      title="Loading update policy"
      body="Reading release channel policy and update safeguards."
    />

    <StatePanel
      v-else-if="!status"
      kind="empty"
      title="No update policy loaded"
      body="Refresh to load update strategy status."
      action-label="Refresh"
      @action="$emit('refresh')"
    />

    <div v-else class="update-panel__body">
      <p class="update-panel__summary">{{ status.summary }}</p>
      <p><strong>Current version:</strong> {{ status.currentVersion }}</p>
      <p><strong>Channel:</strong> {{ status.channel }}</p>
      <p><strong>Mode:</strong> {{ status.mode }}</p>
      <p><strong>Auto update setting:</strong> {{ status.autoUpdateEnabled ? 'enabled' : 'disabled' }}</p>

      <h4 class="update-panel__subheading">Rollback guidance</h4>
      <ul class="update-panel__guidance-list">
        <li v-for="step in status.rollbackGuidance" :key="step">{{ step }}</li>
      </ul>

      <div v-if="lastCheck" class="update-panel__check-result">
        <p><strong>Last check:</strong> {{ lastCheck.checkedAt }}</p>
        <p><strong>Status:</strong> {{ lastCheck.status }}</p>
        <p>{{ lastCheck.message }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { UpdateCheckResult, UpdateStrategyStatus } from '../../shared/ipc';
import StatePanel from './StatePanel.vue';

defineProps<{
  status: UpdateStrategyStatus | null;
  lastCheck: UpdateCheckResult | null;
  loading: boolean;
  checking: boolean;
  error: string | null;
}>();

defineEmits<{
  refresh: [];
  check: [];
}>();
</script>
