<script setup lang="ts">
import { useSettings } from '../composables/useSettings';
import { Button, Switch } from 'frappe-ui';
import IconCheckCircle from '~icons/lucide/check-circle';

const { form, loading, saving, error, successMessage, save } = useSettings();

const editorOptions = [
  { label: 'VS Code', value: 'code' },
  { label: 'Cursor', value: 'cursor' },
  { label: 'Sublime Text', value: 'subl' },
  { label: 'Vim', value: 'vim' },
  { label: 'Nano', value: 'nano' },
  { label: 'None', value: 'none' },
];

const channelOptions = [
  { label: 'Stable', value: 'stable' },
  { label: 'Beta', value: 'beta' },
];
</script>

<template>
  <div class="settings-view">
    <header class="settings-header">
      <h1 class="settings-title">Settings</h1>
      <p class="settings-description">Configure your development environment preferences.</p>
    </header>

    <div v-if="loading" class="settings-loading">
      <span class="status-spinner status-spinner--large"></span>
    </div>

    <form v-else @submit.prevent="save" class="settings-form">
      <div class="form-section">
        <label class="form-field form-field--full">
          <span class="form-label">Storage Path</span>
          <input v-model="form.storagePath" type="text" placeholder="~/Library/Application Support/Frappe Cafe" class="form-input" />
          <p class="form-help text-xs mt-1 opacity-60">Root directory where benches and site data will be stored.</p>
        </label>

        <label class="form-field form-field--full">
          <span class="form-label">Default Frappe Version</span>
          <input v-model="form.defaultFrappeVersion" type="text" placeholder="version-15" class="form-input" />
        </label>

        <div class="form-grid">
          <label class="form-field">
            <span class="form-label">Editor Preference</span>
            <select v-model="form.editorPreference" class="form-select">
              <option v-for="opt in editorOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>


        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="font-medium">Compact Sidebar</span>
            <span class="text-sm opacity-60">Use icons only in the sidebar for more space.</span>
          </div>
          <Switch v-model="form.sidebarCompact" />
        </div>
      </div>

      <div v-if="error" class="alert alert--error mt-4">
        {{ error }}
      </div>
      <div v-if="successMessage" class="alert alert--success mt-4">
        <IconCheckCircle class="alert-icon" />
        {{ successMessage }}
      </div>

      <div class="flex justify-end pt-6">
        <Button variant="solid" :loading="saving" type="submit">
          Save Settings
        </Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 32px;
  max-width: 640px;
  margin: 0 auto;
}

.settings-header {
  margin-bottom: 32px;
}

.settings-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-description {
  margin-top: 4px;
  color: var(--text-secondary);
}

.settings-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.settings-form {
  display: grid;
  gap: 24px;
}

.form-section {
  display: grid;
  gap: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.status-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-neutral);
  border-top-color: var(--text-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.status-spinner--large {
  width: 32px;
  height: 32px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
