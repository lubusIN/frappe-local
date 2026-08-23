<template>
  <SettingsHeader
    title="Preferences"
    description="Choose how you want to use the application by setting your preferences."
  />
  <SettingsBody>
    <div>
      <StatePanel
        v-if="error"
        kind="error"
        title="Unable to load settings"
        :body="error"
        action-label="Retry"
        @action="$emit('refresh')"
      />
      <StatePanel
        v-else-if="loading"
        kind="loading"
        title="Loading settings"
        body="Reading current preferences and runtime defaults."
      />
      <div
        v-else
        class="divide-y divide-outline-gray-2"
      >
        <SettingsRow
          title="Default Frappe Version"
          description="Select the Frappe version to use when creating new benches."
        >
          <FrappeVersionSelect v-model="formData.defaultFrappeVersion" />
        </SettingsRow>

        <SettingsRow
          title="Storage Path"
          description="The directory where all your local benches and sites will be stored."
        >
          <div class="flex gap-2 w-full sm:w-80">
            <FormControl
              v-model="formData.storagePath"
              type="text"
              placeholder="/path/to/storage"
              required
              class="flex-1"
            />
            <Button
              size="md"
              variant="subtle"
              @click="$emit('pickStoragePath')"
            >
              Browse
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Terminal"
          description="Select the terminal application to use when opening bench shells."
        >
          <div class="flex flex-col gap-2 w-full sm:w-80">
            <FormControl
              :model-value="selectedTerminalOption"
              type="select"
              :options="terminalOptions"
              @update:model-value="$emit('update:selectedTerminalOption', $event)"
            />
            <FormControl
              v-if="selectedTerminalOption === 'custom'"
              v-model="formData.terminalPreference"
              type="text"
              placeholder="Custom command or binary path (e.g., /usr/local/bin/my-term)"
            />
          </div>
        </SettingsRow>
      </div>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { Button, FormControl, SettingsHeader, SettingsBody, SettingsRow } from 'frappe-ui';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import FrappeVersionSelect from '@frappe-local/renderer/components/ui/FrappeVersionSelect.vue';
import type { Settings } from '@frappe-local/shared/domain';

const props = defineProps<{
  form: Settings;
  loading: boolean;
  error: string | null;
  terminalOptions: Array<{label: string, value: string}>;
  selectedTerminalOption: string;
}>();

const formData = props.form;

defineEmits(['refresh', 'pickStoragePath', 'update:selectedTerminalOption']);
</script>