<template>
  <section class="form-card">
    <div class="form-card__header">
      <div>
        <h3 class="form-card__title">Diagnostics</h3>
        <p class="form-card__subtitle">Release readiness checks</p>
      </div>
      <div class="form-card__actions">
        <button type="button" class="btn btn--subtle btn--sm" :disabled="running" @click="$emit('run')">
          {{ running ? 'Running…' : 'Run Diagnostics' }}
        </button>
      </div>
    </div>

    <div class="form-card__body">
      <StatePanel
        v-if="error"
        kind="error"
        title="Diagnostics failed"
        :body="error"
        action-label="Retry"
        @action="$emit('run')"
      />

      <StatePanel
        v-else-if="!report && !running"
        kind="empty"
        title="No diagnostics report"
        body="Run diagnostics to verify runtime dependencies, storage access, and startup readiness."
      />

      <StatePanel
        v-else-if="running && !report"
        kind="loading"
        title="Running diagnostics"
        body="Checking dependencies, writable paths, and startup configuration."
      />

      <template v-else-if="report">
        <div class="diagnostics-summary">
          <p class="diagnostics-summary__text">{{ summaryText }}</p>
          <div class="diagnostics-summary__meta">
            <span>Version: {{ report.appVersion }}</span>
            <span>Completed: {{ report.completedAt }}</span>
          </div>
        </div>

        <div class="diagnostics-grid">
          <div v-for="check in report.checks" :key="`${check.type}-${check.title}`" class="check-card">
            <div class="check-card__header">
              <strong class="check-card__title">{{ check.title }}</strong>
              <span class="status-pill" :class="`status-pill--${check.status}`">
                {{ check.status }}
              </span>
            </div>
            <p class="check-card__desc">{{ check.description }}</p>
            <div v-if="check.remediation" class="check-card__remediation">
              <p class="remediation-text">{{ check.remediation }}</p>
              <button
                v-if="check.type === 'runtime-health' && check.status === 'failed'"
                type="button"
                class="btn btn--subtle btn--xs fix-btn"
                :disabled="fixing"
                @click="$emit('fix', check.type)"
              >
                {{ fixing ? 'Fixing...' : 'Attempt Fix' }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DiagnosticsReport } from '../../shared/domain/diagnostics';
import StatePanel from './StatePanel.vue';

const props = defineProps<{
  report: DiagnosticsReport | null;
  running: boolean;
  fixing?: boolean;
  error: string | null;
}>();

defineEmits<{
  run: [];
  fix: [checkType: string];
}>();

const summaryText = computed(() => {
  if (props.running) {
    return 'Inspecting local dependencies and startup preconditions.';
  }

  if (!props.report) {
    return 'No report recorded yet.';
  }

  return props.report.summary;
});
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
.btn--xs { min-height: 20px; padding: 0 6px; font-size: 10px; }

.fix-btn {
  margin-top: 8px;
  background: var(--surface-card);
  border-color: var(--orange-border);
  color: var(--orange-text);
}

.remediation-text {
  margin: 0;
}

/* Summary */
.diagnostics-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--surface-subtle);
  border-radius: 6px;
  border: 1px solid var(--border-light);
}

.diagnostics-summary__text {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.diagnostics-summary__meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Grid */
.diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.check-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface-bg);
}

.check-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.check-card__title {
  font-size: 13px;
  color: var(--text-primary);
}

.check-card__desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.check-card__remediation {
  margin-top: 4px;
  padding: 8px;
  background: var(--orange-light);
  color: var(--orange-text);
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid var(--orange-border);
}

.status-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-pill--pass,
.status-pill--ok {
  background: var(--green-light);
  color: var(--green-text);
}

.status-pill--fail,
.status-pill--error {
  background: var(--red-light);
  color: var(--red-text);
}

.status-pill--warn {
  background: var(--orange-light);
  color: var(--orange-text);
}
</style>
