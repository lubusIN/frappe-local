<template>
  <Dialog
    :model-value="open"
    :title="`Manage Apps in ${resourceName}`"
    size="4xl"
    @update:model-value="onOpenChange"
    @close="$emit('close')"
  >
    <template #default>
      <div class="flex flex-col gap-4">
        <div
          v-if="warningMessage"
          class="pt-6"
        >
          <Alert 
            theme="yellow" 
            :title="warningMessage" 
            :dismissible="false" 
          />
        </div>
        <div
          class="flex flex-col min-h-0 gap-3"
          :class="warningMessage ? 'pt-0' : 'pt-6'"
        >
          <AppManager
            :context="context"
            :active-app-ids="activeAppIds"
            :allowed-app-ids="allowedAppIds"
            :disabled="disabled"
            :frappe-version="frappeVersion"
            :loading-app-id="loadingAppId"
            @add-app="$emit('add-app', $event)"
            @remove-app="$emit('remove-app', $event)"
            @install-app="$emit('add-app', $event)"
            @uninstall-app="$emit('remove-app', $event)"
          />
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-3">
        <Button
          size="md"
          variant="solid"
          @click="$emit('close')"
        >
          Close
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { Alert, Button, Dialog } from 'frappe-ui';
import AppManager from '../AppManager.vue';

defineProps<{
  open: boolean;
  resourceName: string;
  context: 'bench' | 'site';
  activeAppIds: string[];
  allowedAppIds?: string[];
  disabled: boolean;
  warningMessage: string | null;
  frappeVersion?: string;
  loadingAppId: string | null;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
  (event: 'close'): void;
  (event: 'add-app', appId: string): void;
  (event: 'remove-app', appId: string): void;
}>();

const onOpenChange = (value: boolean) => {
  emit('update:open', value);
  if (!value) {
    emit('close');
  }
};
</script>
