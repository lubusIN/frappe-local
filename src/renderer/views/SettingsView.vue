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

    <p v-if="error" class="settings-error">{{ error }}</p>
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
  </section>
</template>

<script setup lang="ts">
import { useSettings } from '../composables/useSettings';

const { form, loading, saving, error, successMessage, refresh, save } = useSettings();
</script>