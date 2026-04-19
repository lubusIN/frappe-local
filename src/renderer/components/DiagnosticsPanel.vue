<template>
  <section class="diagnostics-panel">
    <header class="diagnostics-panel__header">
      <div>
        <p class="card-eyebrow">Release readiness</p>
        <h3 class="diagnostics-panel__title">Diagnostics</h3>
        <p class="diagnostics-panel__summary">{{ summaryText }}</p>
      </div>
      <button type="button" class="diagnostics-panel__action" :disabled="running" @click="$emit('run')">
        {{ running ? 'Running…' : 'Run diagnostics' }}
      </button>
    </header>

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
      title="No diagnostics report yet"
      body="Run diagnostics to verify runtime dependencies, storage access, and startup readiness."
      action-label="Run diagnostics"
      @action="$emit('run')"
    />

    <StatePanel
      v-else-if="running && !report"
      kind="loading"
      title="Running diagnostics"
      body="Checking dependencies, writable paths, and startup configuration."
    />

    <div v-else-if="report" class="diagnostics-panel__body">
      <div class="diagnostics-panel__meta">
        <span>Completed {{ report.completedAt }}</span>
        <span>Version {{ report.appVersion }}</span>
      </div>

      <ul class="diagnostics-panel__list">
        <li v-for="check in report.checks" :key="`${check.type}-${check.timestamp}`" class="diagnostics-panel__item">
          <div class="diagnostics-panel__item-header">
            <strong>{{ check.title }}</strong>
            <span :class="['diagnostics-panel__status', `diagnostics-panel__status--${check.status}`]">
              {{ check.status }}
            </span>
          </div>
          <p>{{ check.description }}</p>
          <p v-if="check.remediation" class="diagnostics-panel__remediation">{{ check.remediation }}</p>
        </li>
      </ul>
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
  error: string | null;
}>();

defineEmits<{
  run: [];
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
