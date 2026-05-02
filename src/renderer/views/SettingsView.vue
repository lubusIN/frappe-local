<template>
  <section class="settings-view">
    <header class="view-header">
      <h2 class="view-header__title">Settings</h2>
      <div class="view-header__actions">
        <button type="button" class="btn btn--subtle" @click="refresh" :disabled="loading || saving">
          <IconRotateCcw class="btn-icon" />
          {{ loading ? 'Refreshing…' : 'Reload' }}
        </button>
      </div>
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

    <div v-if="successMessage" class="alert alert--success">
      <IconCheckCircle class="alert-icon" />
      {{ successMessage }}
    </div>

    <div class="form-card">
      <h3 class="form-card__title">Preferences</h3>
      <form class="form-grid" @submit.prevent="save">
        <label class="form-field">
          <span class="form-label">Default Frappe Version</span>
          <input v-model="form.defaultFrappeVersion" type="text" required />
        </label>



        <label class="form-field form-field--full">
          <span class="form-label">Storage Path</span>
          <input v-model="form.storagePath" type="text" required />
        </label>

        <label class="form-field">
          <span class="form-label">Terminal Preference</span>
          <input v-model="form.terminalPreference" type="text" />
        </label>

        <label class="form-field">
          <span class="form-label">Editor Preference</span>
          <input v-model="form.editorPreference" type="text" />
        </label>

        <label class="form-field">
          <span class="form-label">Update Channel</span>
          <select v-model="form.updateChannel">
            <option value="stable">stable</option>
            <option value="beta">beta</option>
          </select>
        </label>

        <label class="form-checkbox form-field--full">
          <input v-model="form.autoUpdateEnabled" type="checkbox" />
          <span>Enable auto updates</span>
        </label>

        <div class="form-actions form-field--full">
          <button class="btn btn--primary" type="submit" :disabled="loading || saving">
            {{ saving ? 'Saving…' : 'Save settings' }}
          </button>
        </div>
      </form>
    </div>



    <DiagnosticsPanel
      :report="diagnostics.report"
      :running="diagnostics.isRunning"
      :error="diagnostics.error"
      @run="diagnostics.runDiagnostics"
    />

    <UpdateStrategyPanel
      :status="updates.status"
      :last-check="updates.lastCheck"
      :loading="updates.loading"
      :checking="updates.checking"
      :error="updates.error"
      @refresh="updates.load"
      @check="updates.checkNow"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconCheckCircle from '~icons/lucide/check-circle';
import DiagnosticsPanel from '../components/DiagnosticsPanel.vue';
import StatePanel from '../components/StatePanel.vue';
import UpdateStrategyPanel from '../components/UpdateStrategyPanel.vue';
import { useDiagnostics } from '../diagnostics-controller';
import { useUpdateStrategy } from '../update-strategy-controller';
import { useSettings } from '../composables/useSettings';
import { useIpc } from '../composables/useIpc';

const { form, loading, saving, error, successMessage, refresh, save } = useSettings();
const ipc = useIpc();
const diagnostics = useDiagnostics(ipc);
const updates = useUpdateStrategy(ipc);

onMounted(() => {
  void diagnostics.loadLastReport();
  void updates.load();
});
</script>

<style scoped>
.settings-view {
  display: grid;
  gap: 16px;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.view-header__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.view-header__actions {
  display: flex;
  gap: 8px;
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
  white-space: nowrap;
}

.btn:hover:not(:disabled) { background: var(--surface-hover); }
.btn--subtle { border-color: var(--border-default); }
.btn--primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn--primary:hover:not(:disabled) { background: var(--primary-hover); }

/* Alert */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.alert--success {
  color: var(--green-text);
  background: var(--green-light);
  border: 1px solid var(--green-border);
}

/* Form card */
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.form-card__title {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  padding: 16px;
}

.form-field { display: grid; gap: 4px; }
.form-field--full { grid-column: 1 / -1; }
.form-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.form-actions { display: flex; gap: 8px; padding-top: 4px; }

.form-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-checkbox span {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>