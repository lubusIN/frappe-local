<template>
  <SettingsHeader
    title="Updates"
    description="Manage how Frappe Local receives updates."
  />
  <SettingsBody>
    <div class="divide-y divide-outline-gray-2">
      <SettingsRow
        title="Auto Update"
        description="Automatically check for and download updates in the background."
      >
        <Switch
          v-model="formData.autoUpdateEnabled"
          size="sm"
        />
      </SettingsRow>

      <SettingsRow
        title="Update Channel"
        description="Choose how early you'd like to receive new updates."
      >
        <FormControl
          v-model="formData.updateChannel"
          type="select"
          :options="[
            { label: 'Stable', value: 'stable' },
            { label: 'Dev', value: 'dev' }
          ]"
        />
      </SettingsRow>

      <SettingsRow
        title="Check for Updates"
        :description="`Last checked: ${formattedLastChecked}${updateMessage ? ' - ' + updateMessage : ''}`"
      >
        <div class="flex items-center gap-2">
          <Button
            v-if="isUpdateAvailable"
            size="sm"
            variant="solid"
            :loading="isDownloadingUpdate"
            @click="onDownloadUpdate"
          >
            Download & Install
          </Button>
          <Button
            v-else
            size="sm"
            variant="subtle"
            :loading="isCheckingForUpdates"
            @click="onCheckForUpdates"
          >
            Check Now
          </Button>
        </div>
      </SettingsRow>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { Button, SettingsHeader, SettingsBody, SettingsRow, Switch, FormControl } from 'frappe-ui';
import type { Settings } from '@frappe-local/shared/domain';

const props = defineProps<{
  form: Settings;
  updateMessage: string | null;
  isUpdateAvailable: boolean;
  isCheckingForUpdates: boolean;
  isDownloadingUpdate: boolean;
  formattedLastChecked: string;
}>();

const formData = props.form;

defineEmits(['checkForUpdates', 'downloadUpdate']);
</script>