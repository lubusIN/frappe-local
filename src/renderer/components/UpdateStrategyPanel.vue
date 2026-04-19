<template>
  <section class="form-card">
    <div class="form-card__header">
      <div>
        <h3 class="form-card__title">Update Strategy</h3>
        <p class="form-card__subtitle">Release channel policy</p>
      </div>
      <div class="form-card__actions">
        <button type="button" class="btn btn--subtle btn--sm" :disabled="loading || checking" @click="$emit('check')">
          {{ checking ? 'Checking…' : 'Check for updates' }}
        </button>
      </div>
    </div>

    <div class="form-card__body">
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
        title="No update policy"
        body="Refresh to load update strategy status."
      />

      <template v-else>
        <div class="update-summary">
          <p class="update-summary__text">{{ status.summary }}</p>
          <div class="update-summary__grid">
            <div class="summary-item"><span>Current version</span><strong>{{ status.currentVersion }}</strong></div>
            <div class="summary-item"><span>Channel</span><strong>{{ status.channel }}</strong></div>
            <div class="summary-item"><span>Mode</span><strong>{{ status.mode }}</strong></div>
            <div class="summary-item"><span>Auto update</span><strong>{{ status.autoUpdateEnabled ? 'Enabled' : 'Disabled' }}</strong></div>
          </div>
        </div>

        <div v-if="lastCheck" class="update-check-result">
          <div class="update-check-result__header">
            <strong>Last Update Check</strong>
            <span class="status-pill" :class="`status-pill--${lastCheck.status}`">{{ lastCheck.status }}</span>
          </div>
          <p class="update-check-result__text">{{ lastCheck.message }}</p>
          <p class="update-check-result__time">Checked at {{ lastCheck.checkedAt }}</p>
        </div>

        <div v-if="status.rollbackGuidance.length > 0" class="rollback-guidance">
          <h4 class="rollback-guidance__title">Rollback Guidance</h4>
          <ul class="rollback-guidance__list">
            <li v-for="step in status.rollbackGuidance" :key="step">{{ step }}</li>
          </ul>
        </div>
      </template>
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

<style scoped>
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.form-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--surface-subtle);
}

.form-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-card__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.form-card__actions { display: flex; gap: 8px; }

.form-card__body {
  padding: 16px;
  display: grid;
  gap: 16px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
}

.btn:hover:not(:disabled) { background: var(--surface-hover); }
.btn--subtle { border-color: var(--border-default); }
.btn--sm { min-height: 24px; padding: 0 8px; font-size: 11px; }

/* Blocks */
.update-summary {
  display: grid;
  gap: 12px;
  padding: 14px;
  background: var(--surface-subtle);
  border-radius: 6px;
  border: 1px solid var(--border-light);
}

.update-summary__text {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.update-summary__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.summary-item span { color: var(--text-secondary); }
.summary-item strong { color: var(--text-primary); font-weight: 500; }

.update-check-result {
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 12px;
  display: grid;
  gap: 6px;
}

.update-check-result__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-primary);
}

.update-check-result__text {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.update-check-result__time {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.rollback-guidance {
  border-top: 1px dashed var(--border-light);
  padding-top: 12px;
}

.rollback-guidance__title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.rollback-guidance__list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-secondary);
  display: grid;
  gap: 4px;
}

.status-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-pill--success,
.status-pill--ok {
  background: var(--green-light);
  color: var(--green-text);
}

.status-pill--error {
  background: var(--red-light);
  color: var(--red-text);
}

.status-pill--checking {
  background: var(--blue-light);
  color: var(--blue-text);
}
</style>
