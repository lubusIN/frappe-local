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
        <EmptyState
          v-if="showNoBenchAppsState"
          title="No apps on this bench"
          description="Add apps to the parent bench before installing them on this site."
          :icon="IconPackage"
        >
          <Button
            variant="solid"
            @click="$emit('manage-bench-apps')"
          >
            Manage bench apps
          </Button>
        </EmptyState>
        <div
          v-else
          class="flex flex-col min-h-0 gap-3"
        >
          <Tabs :tabs="appTabs" v-model="activeTabIndex">
            <template #tab-panel="{ tab }">
              <div class="pt-4">
                <component
                  :is="tab.value === 'catalog' ? AppManager : CustomAppManager"
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
            </template>
          </Tabs>
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
import { Alert, Button, Dialog, Tabs } from 'frappe-ui';
import IconPackage from '~icons/lucide/package';
import { computed, ref } from 'vue';
import AppManager from '../AppManager.vue';
import CustomAppManager from '../CustomAppManager.vue';
import EmptyState from '../ui/EmptyState.vue';

const props = defineProps<{
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
  (event: 'manage-bench-apps'): void;
}>();

const showNoBenchAppsState = computed(() =>
  props.context === 'site' &&
  Array.isArray(props.allowedAppIds) &&
  props.allowedAppIds.filter((appId) => appId.trim() !== 'frappe').length === 0
);

const appTabs = [
  { label: 'Brewery', value: 'catalog' },
  { label: 'My Apps', value: 'custom' },
];

const activeTabIndex = ref(0);

const onOpenChange = (value: boolean) => {
  emit('update:open', value);
  if (!value) {
    emit('close');
  }
};
</script>
