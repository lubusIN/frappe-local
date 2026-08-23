<template>
  <SettingsHeader
    title="Appearance"
    description="Customize the look and feel of the application."
  />
  <SettingsBody>
    <div class="py-4">
      <ThemeSwitcher
        v-model="formData.theme"
        name="Local"
        :logo="AppLogo"
      />
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { SettingsHeader, SettingsBody, ThemeSwitcher } from 'frappe-ui';
import type { Settings } from '@frappe-local/shared/domain';
import AppLogo from '@frappe-local/renderer/components/ui/AppLogo.vue';

const props = defineProps<{
  form: Settings;
}>();

const formData = props.form;
</script>