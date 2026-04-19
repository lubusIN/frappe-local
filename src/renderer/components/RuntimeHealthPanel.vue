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