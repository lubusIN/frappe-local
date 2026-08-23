<template>
  <ScrollArea class="h-full">
    <div class="space-y-6 px-6 py-5 w-full">
      <div class="flex flex-col gap-4">
        <div
          v-if="warningMessage"
          class="pt-2"
        >
          <Alert
            theme="amber"
            :title="warningMessage"
            :dismissible="false"
          />
        </div>
        <AppManager
          class="pt-1 w-full"
          container-class="flex flex-col gap-1 w-full"
          :resource-id="bench.id"
          :resource-name="bench.name"
          :bench-status="bench.status"
          context="bench"
          :active-app-ids="bench.apps || []"
          :disabled="!canMutate || updating"
          :frappe-version="bench.frappeVersion"
          :loading-app-id="updating ? pendingRemoveId || 'adding' : null"
          @add-app="$emit('addApp', $event)"
          @remove-app="$emit('removeApp', $event)"
          @install-app="$emit('addApp', $event)"
          @uninstall-app="$emit('removeApp', $event)"
        />
      </div>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { Alert, ScrollArea } from 'frappe-ui';
import AppManager from '@frappe-local/renderer/components/AppManager.vue';
import type { BenchListItem } from '@frappe-local/shared/core';

defineProps<{
  bench: BenchListItem;
  warningMessage: string | null;
  canMutate: boolean;
  updating: boolean;
  pendingRemoveId: string | null;
}>();

defineEmits(['addApp', 'removeApp']);
</script>
