<template>
  <div class="diagnostics-panel">
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
      <div class="diagnostics-summary-card" :class="summaryStatusClass">
        <div class="summary-card__icon">
          <component :is="summaryIcon" class="w-5 h-5" />
        </div>
        <div class="summary-card__content">
          <p class="summary-card__title">Environment Status</p>
          <p class="summary-card__text">{{ summaryText }}</p>
          <div class="summary-card__meta">
            <span>Version: {{ report.appVersion }}</span>
            <span>Completed: {{ report.completedAt }}</span>
          </div>
        </div>
      </div>

      <div class="diagnostics-list-container">
        <table class="diagnostics-table">
          <thead>
            <tr>
              <th class="diagnostics-th diagnostics-th--check">Check</th>
              <th class="diagnostics-th diagnostics-th--status">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="check in report.checks" :key="check.title" class="diagnostics-row">
              <td class="diagnostics-cell diagnostics-cell--check">
                <div class="check-details">
                  <div class="check-title">{{ check.title }}</div>
                  <div class="check-description">{{ check.description }}</div>
                  <div v-if="check.remediation" class="check-remediation">
                    <span class="remediation-label">Remediation:</span>
                    {{ check.remediation }}
                    <div v-if="check.type === 'runtime-health' && check.status === 'failed'" class="remediation-actions">
                      <Button
                        variant="subtle"
                        size="sm"
                        theme="orange"
                        :loading="fixing"
                        @click="$emit('fix', check.type)"
                      >
                        Attempt Fix
                      </Button>
                    </div>
                  </div>
                </div>
              </td>
              <td class="diagnostics-cell diagnostics-cell--status">
                <div class="check-status">
                  <Badge
                    :theme="getBadgeTheme(check.status)"
                    variant="subtle"
                    size="sm"
                    class="capitalize"
                  >
                    {{ check.status }}
                  </Badge>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Badge, Button } from 'frappe-ui';
import IconActivity from '~icons/lucide/activity';
import IconShieldCheck from '~icons/lucide/shield-check';
import IconShieldAlert from '~icons/lucide/shield-alert';
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

const summaryIcon = computed(() => {
  if (props.running) return IconActivity;
  if (!props.report) return IconShieldCheck;
  if (props.report.hasCriticalIssues) return IconShieldAlert;
  if (props.report.hasWarnings) return IconShieldAlert;
  return IconShieldCheck;
});

const summaryStatusClass = computed(() => {
  if (props.running) return 'is-running';
  if (!props.report) return 'is-idle';
  if (props.report.hasCriticalIssues) return 'is-critical';
  if (props.report.hasWarnings) return 'is-warning';
  return 'is-success';
});

const getBadgeTheme = (status: string) => {
  switch (status) {
    case 'passed':
    case 'ok':
      return 'green';
    case 'failed':
    case 'error':
      return 'red';
    case 'warning':
    case 'warn':
      return 'orange';
    case 'skipped':
      return 'gray';
    default:
      return 'gray';
  }
};
</script>

<style scoped>
.diagnostics-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Summary Card (Dashboard style) */
.diagnostics-summary-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.summary-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

/* Status variants for icon background */
.is-success .summary-card__icon { background: var(--green-light); color: var(--green-text); }
.is-warning .summary-card__icon { background: var(--orange-light); color: var(--orange-text); }
.is-critical .summary-card__icon { background: var(--red-light); color: var(--red-text); }
.is-running .summary-card__icon { background: var(--blue-light); color: var(--blue-text); }

.summary-card__content {
  flex: 1;
}

.summary-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.summary-card__text {
  margin: 2px 0 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.summary-card__meta {
  display: flex;
  gap: 16px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

/* Table Layout (matching Bench view) */
.diagnostics-list-container {
  background: white;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.diagnostics-table {
  width: 100%;
  border-collapse: collapse;
}

.diagnostics-th {
  background: var(--surface-subtle, #f8f9fa);
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.diagnostics-th--status {
  text-align: right;
  width: 120px;
}

.diagnostics-row {
  transition: background-color 100ms ease;
}

.diagnostics-row:hover {
  background-color: var(--surface-subtle, #f8f9fa);
}

.diagnostics-cell {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, #f3f4f6);
  vertical-align: top;
}

.diagnostics-row:last-child .diagnostics-cell {
  border-bottom: none;
}

.check-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.check-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.check-description {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.check-remediation {
  margin-top: 8px;
  padding: 12px;
  background: var(--orange-light);
  color: var(--orange-text);
  border-radius: 6px;
  font-size: 12px;
  border: 1px solid var(--orange-border);
  line-height: 1.6;
}

.remediation-label {
  font-weight: 700;
  margin-right: 4px;
}

.remediation-actions {
  margin-top: 10px;
}

.check-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.capitalize {
  text-transform: capitalize;
}
</style>
