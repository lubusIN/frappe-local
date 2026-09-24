<template>
  <SettingsHeader
    title="Appearance"
    description="Customize the look and feel of the application."
  />
  <SettingsBody>
    <div class="divide-y divide-outline-gray-2">
      <SettingsRow
        title="Theme"
        description="Select your preferred application theme."
      >
        <div class="flex gap-2 w-full sm:w-80">
          <FormControl
            v-model="formData.theme"
            type="select"
            :options="themeOptions"
            class="flex-1"
          />
        </div>
      </SettingsRow>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { SettingsHeader, SettingsBody, SettingsRow, FormControl } from 'frappe-ui';
import type { Settings } from '@frappe-local/shared/domain';

const props = defineProps<{
  form: Settings;
}>();

const formData = props.form;

const themeOptions = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];
</script>