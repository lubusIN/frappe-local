<template>
  <section class="settings-view">
    <header class="settings-header">
      <div>
        <p class="card-eyebrow">Preferences</p>
        <h3 class="settings-title">App settings</h3>
      </div>
      <button type="button" class="settings-refresh" @click="refresh" :disabled="loading || saving">
        {{ loading ? 'Refreshing…' : 'Reload' }}
      </button>
    </header>

    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load settings"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />
    <StatePanel
      v-else-if="loading"
      kind="loading"
      title="Loading settings"
      body="Reading current preferences and runtime defaults."
    />
    <p v-if="successMessage" class="settings-success">{{ successMessage }}</p>

    <form class="settings-form" @submit.prevent="save">
      <label class="settings-field">
        <span>Default Frappe Version</span>
        <input v-model="form.defaultFrappeVersion" type="text" required />
      </label>

      <label class="settings-field">
        <span>Runtime Preference</span>
        <select v-model="form.runtimePreference">
          <option value="docker">docker</option>
          <option value="podman">podman</option>
        </select>
      </label>

      <label class="settings-field settings-field--full">
        <span>Storage Path</span>
        <input v-model="form.storagePath" type="text" required />
      </label>

      <label class="settings-field">
        <span>Terminal Preference</span>
        <input v-model="form.terminalPreference" type="text" />
      </label>

      <label class="settings-field">
        <span>Editor Preference</span>
        <input v-model="form.editorPreference" type="text" />
      </label>

      <label class="settings-field">
        <span>Update Channel</span>
        <select v-model="form.updateChannel">
          <option value="stable">stable</option>
          <option value="beta">beta</option>
        </select>
      </label>

      <label class="settings-checkbox settings-field--full">
        <input v-model="form.autoUpdateEnabled" type="checkbox" />
        <span>Enable auto updates</span>
      </label>

      <div class="settings-actions settings-field--full">
        <button class="settings-save" type="submit" :disabled="loading || saving">
          {{ saving ? 'Saving…' : 'Save settings' }}
        </button>
      </div>
    </form>

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

    <DiagnosticsPanel
      :report="diagnostics.report"
      :running="diagnostics.isRunning"
      :error="diagnostics.error"
      @run="diagnostics.runDiagnostics"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import DiagnosticsPanel from '../components/DiagnosticsPanel.vue';
import RuntimeHealthPanel from '../components/RuntimeHealthPanel.vue';
import StatePanel from '../components/StatePanel.vue';
import { useDiagnostics } from '../diagnostics-controller';
import { useSettings } from '../composables/useSettings';
import { useIpc } from '../composables/useIpc';
import { useRuntimeHealth } from '../composables/useRuntimeHealth';

const { form, loading, saving, error, successMessage, refresh, save } = useSettings();
const diagnostics = useDiagnostics(useIpc());
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

onMounted(() => {
  void diagnostics.loadLastReport();
});
</script>