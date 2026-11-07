<template>
  <ScrollArea class="h-full">
    <div class="flex flex-col gap-4 px-6 py-5 w-full">
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
        :resource-id="benchId"
        :bench-status="benchStatus"
        context="site"
        :active-app-ids="site.apps || []"
        :disabled="updating || !canMutate"
        :frappe-version="frappeVersion"
        :loading-app-id="activatingAppId"
        @add-app="$emit('addApp', $event)"
        @remove-app="$emit('removeApp', $event)"
        @install-app="$emit('addApp', $event)"
        @uninstall-app="$emit('removeApp', $event)"
      />
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { Alert, ScrollArea } from 'frappe-ui';
import AppManager from '@frappe-local/renderer/components/AppManager.vue';
import type { SiteListItem } from '@frappe-local/shared/core';

defineProps<{
  site: SiteListItem;
  benchId: string | undefined;
  benchStatus: string | undefined;
  frappeVersion: string | undefined;
  warningMessage: string | null;
  canMutate: boolean;
  updating: boolean;
  activatingAppId: string | null;
}>();

defineEmits(['addApp', 'removeApp']);
</script>
