<script setup lang="ts">
import { Button, FormControl, FormLabel, LoadingIndicator, Select, Switch } from 'frappe-ui';
import IconCheckCircle from '~icons/lucide/check-circle';
import { useSettings } from '../composables/useSettings';

const { form, loading, saving, error, successMessage, save } = useSettings();

const editorOptions = [
  { label: 'VS Code', value: 'code' },
  { label: 'Cursor', value: 'cursor' },
  { label: 'Sublime Text', value: 'subl' },
  { label: 'Vim', value: 'vim' },
  { label: 'Nano', value: 'nano' },
  { label: 'None', value: 'none' },
];
</script>

<template>
  <div class="settings-view">
    <header class="settings-header">
      <h1 class="settings-title">
        Settings
      </h1>
      <p class="settings-description">
        Configure your development environment preferences.
      </p>
    </header>

    <div
      v-if="loading"
      class="settings-loading"
    >
      <LoadingIndicator class="settings-loading__indicator" />
    </div>

    <form
      v-else
      class="settings-form"
      @submit.prevent="save"
    >
      <FormControl
        v-model="form.storagePath"
        label="Storage Path"
        description="Root directory where benches and site data will be stored."
        placeholder="~/Library/Application Support/Local Bench"
        variant="outline"
      />

      <FormControl
        v-model="form.defaultFrappeVersion"
        label="Default Frappe Version"
        placeholder="version-15"
        variant="outline"
      />

      <div class="settings-field">
        <FormLabel label="Editor Preference" />
        <Select
          v-model="form.editorPreference"
          :options="editorOptions"
          variant="outline"
        />
      </div>

      <div class="settings-switch-row">
        <div>
          <span class="settings-switch-row__label">Compact Sidebar</span>
          <span class="settings-switch-row__description">Use icons only in the sidebar for more space.</span>
        </div>
        <Switch v-model="form.sidebarCompact" />
      </div>

      <div
        v-if="error"
        class="alert alert--error"
      >
        {{ error }}
      </div>
      <div
        v-if="successMessage"
        class="alert alert--success"
      >
        <IconCheckCircle class="alert-icon" />
        {{ successMessage }}
      </div>

      <div class="settings-actions">
        <Button
          variant="solid"
          :loading="saving"
          type="submit"
        >
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
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-description {
  margin: 4px 0 0;
  color: var(--text-secondary);
}

.settings-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.settings-loading__indicator {
  width: 32px;
  height: 32px;
}

.settings-form {
  display: grid;
  gap: 16px;
}

.settings-field {
  min-width: 0;
}

.settings-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-switch-row__label,
.settings-switch-row__description {
  display: block;
}

.settings-switch-row__label {
  font-weight: 500;
  color: var(--text-primary);
}

.settings-switch-row__description {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-secondary);
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
