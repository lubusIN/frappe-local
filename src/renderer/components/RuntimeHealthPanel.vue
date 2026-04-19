<template>
  <section class="runtime-panel" :class="panelClass">
    <header class="runtime-panel__header">
      <div>
        <p class="card-eyebrow">Runtime Readiness</p>
        <h3 class="runtime-panel__title">Dependencies and repair actions</h3>
      </div>
      <div class="runtime-panel__actions">
        <button type="button" class="runtime-panel__button" :disabled="loading || repairing" @click="$emit('refresh')">
          {{ loading ? 'Checking…' : 'Re-check' }}
        </button>
        <button
          type="button"
          class="runtime-panel__button runtime-panel__button--primary"
          :disabled="repairing || !canRepair"
          @click="$emit('repair')"
        >
          {{ repairing ? 'Repairing…' : canRepair ? 'Install / Repair' : 'Runtime ready' }}
        </button>
        <button
          v-if="repairLogs.length > 0"
          type="button"
          class="runtime-panel__button"
          @click="showLogs = !showLogs"
        >
          {{ showLogs ? 'Hide logs' : 'View logs' }}
        </button>
      </div>
    </header>

    <ErrorNotice
      v-if="errorNotice"
      :notice="errorNotice"
      tone="danger"
      @action="onErrorAction"
    />

    <template v-if="health">
      <p class="runtime-panel__summary">
        Preferred runtime: <strong>{{ health.preferredRuntime }}</strong>
        <span class="runtime-panel__summary-separator">•</span>
        Active runtime: <strong>{{ health.selectedRuntime }}</strong>
        <span v-if="health.fallbackApplied" class="runtime-panel__fallback">Fallback applied</span>
      </p>

      <p v-if="lastTaskMessage" class="runtime-panel__status" :class="statusClass">
        {{ lastTaskMessage }}
      </p>

      <div class="runtime-panel__grid">
        <article v-for="dependency in health.dependencies" :key="dependency.dependency" class="runtime-dependency">
          <div class="runtime-dependency__header">
            <div>
              <h4 class="runtime-dependency__title">{{ dependencyLabel(dependency.dependency) }}</h4>
              <p class="runtime-dependency__summary">{{ dependency.summary }}</p>
            </div>
            <span class="runtime-dependency__status" :class="`runtime-dependency__status--${dependency.status}`">
              {{ dependency.status }}
            </span>
          </div>

          <p class="runtime-dependency__version">
            Detected: <strong>{{ dependency.detectedVersion ?? 'Unavailable' }}</strong>
            <span class="runtime-panel__summary-separator">•</span>
            Required: <strong>{{ dependency.requiredVersion }}</strong>
          </p>

          <p class="runtime-dependency__guidance-title">{{ dependency.guidance.title }}</p>
          <ul class="runtime-dependency__guidance-list">
            <li v-for="step in dependency.guidance.steps" :key="step">{{ step }}</li>
          </ul>
        </article>
      </div>

      <div v-if="showLogs && repairLogs.length > 0" class="runtime-panel__logs">
        <p class="runtime-panel__logs-title">Repair log stream</p>
        <ol class="runtime-panel__logs-list">
          <li v-for="entry in repairLogs" :key="entry">{{ entry }}</li>
        </ol>
      </div>
    </template>

    <p v-else-if="loading" class="runtime-panel__empty">Checking runtime dependencies…</p>
    <p v-else class="runtime-panel__empty">Runtime health has not been checked yet.</p>
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
  if (props.error) return 'runtime-panel--error';
  if (props.repairing) return 'runtime-panel--active';
  if (!props.health?.hasBlockingIssues && !props.health?.fallbackApplied) return 'runtime-panel--ok';
  return '';
});

const statusClass = computed(() => {
  if (props.activeTaskStatus === 'failure') return 'runtime-panel__status--error';
  if (props.activeTaskStatus === 'success') return 'runtime-panel__status--ok';
  return 'runtime-panel__status--active';
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
.runtime-panel {
  border: 1px solid #e4e9ef;
  border-radius: 12px;
  background: #ffffff;
  padding: 14px;
  display: grid;
  gap: 12px;
}

.runtime-panel--ok {
  border-color: #bbf7d0;
}

.runtime-panel--active {
  border-color: #d3e2ff;
}

.runtime-panel--error {
  border-color: #fecaca;
}

.runtime-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.runtime-panel__title {
  margin: 0;
  font-size: 18px;
  color: #1f272e;
}

.runtime-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.runtime-panel__button {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #d7dee8;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
}

.runtime-panel__button--primary {
  background: #eaf2ff;
  border-color: #d3e2ff;
  color: #1e3a8a;
}

.runtime-panel__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.runtime-panel__summary {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.runtime-panel__summary-separator {
  margin: 0 6px;
  color: #94a3b8;
}

.runtime-panel__fallback {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #fecaca;
  color: #b42318;
  background: #fff7f7;
  font-size: 11px;
  text-transform: uppercase;
}

.runtime-panel__status {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.runtime-panel__status--active {
  color: #1e3a8a;
  background: #eaf2ff;
}

.runtime-panel__status--ok {
  color: #166534;
  background: #f0fdf4;
}

.runtime-panel__status--error {
  color: #b42318;
  background: #fff7f7;
}

.runtime-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}

.runtime-dependency {
  border: 1px solid #e4e9ef;
  border-radius: 10px;
  background: #f8fafc;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.runtime-dependency__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.runtime-dependency__title,
.runtime-dependency__summary,
.runtime-dependency__version,
.runtime-dependency__guidance-title {
  margin: 0;
}

.runtime-dependency__title {
  font-size: 15px;
  color: #1f272e;
}

.runtime-dependency__summary,
.runtime-dependency__version {
  font-size: 13px;
  color: #64748b;
}

.runtime-dependency__status {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #d7dee8;
  background: #fff;
  color: #475569;
  font-size: 11px;
  text-transform: uppercase;
}

.runtime-dependency__status--ready,
.runtime-dependency__status--ok {
  border-color: #bbf7d0;
  color: #166534;
  background: #f0fdf4;
}

.runtime-dependency__status--missing,
.runtime-dependency__status--error,
.runtime-dependency__status--blocked {
  border-color: #fecaca;
  color: #b42318;
  background: #fff7f7;
}

.runtime-dependency__guidance-title {
  font-size: 12px;
  color: #475569;
  font-weight: 600;
}

.runtime-dependency__guidance-list {
  margin: 0;
  padding-left: 18px;
  color: #334155;
  font-size: 13px;
  display: grid;
  gap: 4px;
}

.runtime-panel__logs {
  border-top: 1px solid #e4e9ef;
  padding-top: 10px;
  display: grid;
  gap: 8px;
}

.runtime-panel__logs-title {
  margin: 0;
  font-size: 13px;
  color: #334155;
}

.runtime-panel__logs-list {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
  display: grid;
  gap: 4px;
}

.runtime-panel__empty {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 900px) {
  .runtime-panel__header {
    flex-direction: column;
  }
}
</style>