<template>
  <Dialog
    :model-value="open"
    :options="{ title: `Manage Apps in ${resourceName}`, size: '4xl' }"
    @update:model-value="onOpenChange"
    @close="$emit('close')"
  >
    <template #body-content>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col min-h-0 gap-3 pt-6">
          <AppManager
            mode="manage"
            :context="context"
            :active-app-ids="activeAppIds"
            :allowed-app-ids="allowedAppIds"
            :disabled="disabled"
            :frappe-version="frappeVersion"
            :loading-app-id="loadingAppId"
            @add-app="$emit('add-app', $event)"
            @remove-app="$emit('remove-app', $event)"
          />
        </div>
        <p
          v-if="!canMutate"
          class="text-sm text-ink-amber-4"
        >
          Start the {{ context }} before managing apps.
        </p>
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
import { Button, Dialog } from 'frappe-ui';
import AppManager from './AppManager.vue';

defineProps<{
  open: boolean;
  resourceName: string;
  context: 'bench' | 'site';
  activeAppIds: string[];
  allowedAppIds?: string[];
  disabled: boolean;
  canMutate: boolean;
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
