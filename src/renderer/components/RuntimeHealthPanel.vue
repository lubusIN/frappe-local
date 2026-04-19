<template>
  <section class="form-card" :class="panelClass">
    <div class="form-card__header">
      <div>
        <h3 class="form-card__title">Runtime Readiness</h3>
        <p class="form-card__subtitle">Dependencies and repair actions</p>
      </div>
      <div class="form-card__actions">
        <button type="button" class="btn btn--subtle btn--sm" :disabled="loading || repairing" @click="$emit('refresh')">
          {{ loading ? 'Checking…' : 'Re-check' }}
        </button>
        <button
          type="button"
          class="btn btn--sm"
          :class="canRepair ? 'btn--primary' : 'btn--subtle'"
          :disabled="repairing || !canRepair"
          @click="$emit('repair')"
        >
          {{ repairing ? 'Repairing…' : canRepair ? 'Install / Repair' : 'Runtime ready' }}
        </button>
        <button
          v-if="repairLogs.length > 0"
          type="button"
          class="btn btn--subtle btn--sm"
          @click="showLogs = !showLogs"
        >
          {{ showLogs ? 'Hide logs' : 'View logs' }}
        </button>
      </div>
    </div>

    <div class="form-card__body">
      <ErrorNotice
        v-if="errorNotice"
        :notice="errorNotice"
        tone="danger"
        @action="onErrorAction"
      />

      <template v-if="health">
        <div class="runtime-summary">
          <div class="runtime-summary__item">
            <span class="runtime-summary__label">Preferred runtime:</span>
            <span class="runtime-summary__value">{{ health.preferredRuntime }}</span>
          </div>
          <div class="runtime-summary__item">
            <span class="runtime-summary__label">Active runtime:</span>
            <span class="runtime-summary__value">{{ health.selectedRuntime }}</span>
          </div>
          <span v-if="health.fallbackApplied" class="runtime-badge runtime-badge--fallback">Fallback applied</span>
        </div>

        <div v-if="lastTaskMessage" class="alert" :class="statusClass">
          {{ lastTaskMessage }}
        </div>

        <div class="runtime-grid">
          <article v-for="dependency in health.dependencies" :key="dependency.dependency" class="dependency-card">
            <div class="dependency-card__header">
              <h4 class="dependency-card__title">{{ dependencyLabel(dependency.dependency) }}</h4>
              <span class="status-pill" :class="`status-pill--${dependency.status}`">
                {{ dependency.status }}
              </span>
            </div>

            <p class="dependency-card__summary">{{ dependency.summary }}</p>

            <div class="dependency-card__versions">
              <span class="version-label">Detected: <strong>{{ dependency.detectedVersion ?? 'Unavailable' }}</strong></span>
              <span class="version-label">Required: <strong>{{ dependency.requiredVersion }}</strong></span>
            </div>

            <div class="dependency-card__guidance">
              <p class="guidance-title">{{ dependency.guidance.title }}</p>
              <ul class="guidance-list">
                <li v-for="step in dependency.guidance.steps" :key="step">{{ step }}</li>
              </ul>
            </div>
          </article>
        </div>

        <div v-if="showLogs && repairLogs.length > 0" class="terminal-logs">
          <p class="terminal-logs__title">Repair log stream</p>
          <ol class="terminal-logs__list">
            <li v-for="entry in repairLogs" :key="entry">{{ entry }}</li>
          </ol>
        </div>
      </template>

      <p v-else-if="loading" class="empty-state">Checking runtime dependencies…</p>
      <p v-else class="empty-state">Runtime health has not been checked yet.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RuntimeHealthResponse } from '../../shared/ipc';
import type { TaskStatus } from '../../shared/domain/task-runner';
import ErrorNotice from './ErrorNotice.vue';
import { buildErrorRemediationNotice } from '../error-remediation';

const props = defineProps<{
  health: RuntimeHealthResponse | null;
  loading: boolean;
  repairing: boolean;
  error: string | null;
  activeTaskStatus: TaskStatus | null;
  lastTaskMessage: string | null;
  repairLogs: string[];
}>();

const emit = defineEmits<{
  refresh: [];
  repair: [];
}>();

const showLogs = ref(false);

const canRepair = computed(() => (props.health?.blockingDependencies.length ?? 0) > 0);
const errorNotice = computed(() => (props.error ? buildErrorRemediationNotice('runtime', props.error) : null));

const panelClass = computed(() => {
  if (props.error) return 'form-card--error';
  if (props.repairing) return 'form-card--active';
  if (!props.health?.hasBlockingIssues && !props.health?.fallbackApplied) return 'form-card--success';
  return '';
});

const statusClass = computed(() => {
  if (props.activeTaskStatus === 'failure') return 'alert--danger';
  if (props.activeTaskStatus === 'success') return 'alert--success';
  return 'alert--info';
});

const dependencyLabel = (dependency: string): string => {
  if (dependency === 'docker-compose') return 'Docker Compose';
  if (dependency === 'podman') return 'Podman';
  if (dependency === 'git') return 'Git';
  return dependency;
};

const onErrorAction = (actionId: string): void => {
  if (actionId === 'retry') {
    emit('refresh');
  }
};
</script>

<style scoped>
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
  transition: border-color 200ms ease;
}

.form-card--success { border-color: var(--green-border); }
.form-card--active { border-color: var(--blue-border); }
.form-card--error { border-color: var(--red-border); }

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

.form-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

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
.btn--primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn--primary:hover:not(:disabled) { background: var(--primary-hover); }
.btn--sm { min-height: 24px; padding: 0 8px; font-size: 11px; }

/* Alerts */
.alert {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.alert--info { background: var(--blue-light); color: var(--blue-text); border: 1px solid var(--blue-border); }
.alert--success { background: var(--green-light); color: var(--green-text); border: 1px solid var(--green-border); }
.alert--danger { background: var(--red-light); color: var(--red-text); border: 1px solid var(--red-border); }

/* Summaries */
.runtime-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  padding: 10px 14px;
  background: var(--surface-subtle);
  border-radius: 6px;
  border: 1px solid var(--border-light);
}

.runtime-summary__item {
  display: flex;
  gap: 6px;
  font-size: 13px;
}

.runtime-summary__label { color: var(--text-secondary); }
.runtime-summary__value { color: var(--text-primary); font-weight: 500; }

.runtime-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.runtime-badge--fallback {
  background: var(--orange-light);
  color: var(--orange-text);
  border: 1px solid var(--orange-border);
}

/* Dependencies */
.runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.dependency-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 8px;
  background: var(--surface-card);
}

.dependency-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.dependency-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.dependency-card__summary {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.dependency-card__versions {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.version-label { color: var(--text-secondary); }
.version-label strong { color: var(--text-primary); }

.dependency-card__guidance {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-light);
}

.guidance-title {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.guidance-list {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  display: grid;
  gap: 2px;
}

.status-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-pill--ready,
.status-pill--ok {
  background: var(--green-light);
  color: var(--green-text);
}

.status-pill--missing,
.status-pill--error,
.status-pill--blocked {
  background: var(--red-light);
  color: var(--red-text);
}

/* Terminal logs */
.terminal-logs {
  background: #1a1a2e;
  border-radius: 6px;
  padding: 12px;
}

.terminal-logs__title {
  margin: 0 0 8px;
  font-size: 11px;
  color: #a0a0b0;
  text-transform: uppercase;
}

.terminal-logs__list {
  margin: 0;
  padding-left: 16px;
  color: #e0e0e0;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
  display: grid;
  gap: 2px;
}

.empty-state {
  margin: 0;
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>