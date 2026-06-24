<template>
  <section class="flex flex-col gap-6">
    <StatePanel
      v-if="error && customApps.length === 0"
      kind="error"
      title="Unable to load custom apps"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />

    <StatePanel
      v-if="!error && loading && customApps.length === 0"
      kind="loading"
      title="Loading custom apps"
      body="Fetching your registered custom applications."
    />

    <ResourceListView
      v-if="!error && customApps.length > 0"
      :columns="appColumns"
      :rows="customApps"
      row-key="id"
      empty-title="No custom apps"
      empty-description="No custom apps are available."
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'name'">
          <div class="flex items-center gap-3">
            <div class="flex size-8 items-center justify-center overflow-hidden rounded bg-ink-gray-1 border border-ink-gray-2 text-ink-gray-5 flex-shrink-0">
              <img
                v-if="row.icon && !imageErrors[row.id]"
                :src="row.icon"
                class="size-full object-contain"
                @error="imageErrors[row.id] = true"
              >
              <div
                v-else-if="imageErrors[row.id]"
                class="flex size-full items-center justify-center text-xs font-semibold"
              >
                {{ (row.title || row.name).charAt(0).toUpperCase() }}
              </div>
              <IconPackage
                v-else
                class="size-4"
              />
            </div>
            <div class="flex h-full min-w-0 flex-col justify-center gap-0.5 group">
              <div class="truncate text-sm-medium transition-colors text-ink-gray-9">
                {{ row.title || row.name }}
              </div>
              <div
                class="truncate text-xs text-ink-gray-5"
                :title="row.description || 'No description'"
              >
                {{ row.description || 'No description' }}
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="column.key === 'type'">
          <Badge
            variant="subtle"
            :theme="row.type === 'github' ? 'blue' : 'orange'"
          >
            {{ row.type === 'github' ? 'GitHub' : 'Local' }}
          </Badge>
        </template>
        
        <template v-else-if="column.key === 'source'">
          <div
            class="truncate text-xs text-ink-gray-6 max-w-xs"
            :title="row.source"
          >
            {{ formatSource(row.source) }}
          </div>
        </template>

        <template v-else-if="column.key === 'actions'">
          <div
            class="flex h-full items-center justify-end"
            @click.stop
          >
            <Dropdown
              :options="getAppActions(row)"
              placement="right"
            >
              <template #default>
                <Button
                  size="md"
                  variant="subtle"
                  :icon="IconMoreHorizontal"
                />
              </template>
            </Dropdown>
          </div>
        </template>
      </template>
    </ResourceListView>

    <EmptyState
      v-if="!error && !loading && customApps.length === 0"
      title="No custom apps found"
      description="Register a custom app from GitHub or a local directory to install it on your benches."
      :icon="IconPackage"
    >
      <Button
        variant="solid"
        @click="showAddModal = true"
      >
        Add Custom App
      </Button>
    </EmptyState>

    <AddCustomAppModal
      v-if="showAddModal"
      @close="showAddModal = false"
      @added="onAppAdded"
    />

    <ConfirmationDialog
      :open="confirmDeleteOpen"
      title="Delete Custom App"
      :message="`Are you sure you want to remove &quot;${deleteAppName}&quot; from your custom apps? It will not be uninstalled from benches.`"
      confirm-label="Delete"
      @cancel="cancelDelete"
      @confirm="onConfirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { Badge, Button, Dropdown, toast } from 'frappe-ui';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconPackage from '~icons/lucide/package';
import IconTrash2 from '~icons/lucide/trash2';
import IconPlus from '~icons/lucide/plus';
import { onBeforeUnmount, ref, watchEffect } from 'vue';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import ResourceListView from '@frappe-local/renderer/components/ui/ResourceListView.vue';
import AddCustomAppModal from '@frappe-local/renderer/components/dialogs/AddCustomAppModal.vue';

import { useConfirmAction, usePageHeaderActions } from '@frappe-local/renderer/composables/ui';

import { useCustomApps } from '@frappe-local/renderer/composables/data';
import type { CustomAppListItem } from '@frappe-local/shared/core';

const {
  customApps,
  loading,
  error,
  refresh,
  remove: deleteApp,
} = useCustomApps();

const showAddModal = ref(false);
const imageErrors = ref<Record<string, boolean>>({});

const appColumns = [
  { label: 'App', key: 'name', width: 'minmax(240px, 2fr)' },
  { label: 'Type', key: 'type', width: '100px' },
  { label: 'Source', key: 'source', width: 'minmax(200px, 1.5fr)' },
  { label: '', key: 'actions', width: '48px', align: 'right' },
] satisfies object[];

const {
  isOpen: confirmDeleteOpen,
  pendingId: deleteAppId,
  pendingName: deleteAppName,
  open: confirmDelete,
  cancel: cancelDelete,
} = useConfirmAction();

const getAppActions = (app: CustomAppListItem) => [
  {
    label: 'Delete',
    icon: IconTrash2,
    theme: 'red' as const,
    onClick: () => confirmDelete(app.id, app.name),
  },
];

const onConfirmDelete = async () => {
  if (!deleteAppId.value) return;
  try {
    await deleteApp(deleteAppId.value);
    toast.success(`Removed app ${deleteAppName.value}`);
    cancelDelete();
  } catch (err) {
    console.error(err);
  }
};

const onAppAdded = () => {
  showAddModal.value = false;
  refresh(true);
};

const formatSource = (path: string) => {
  if (!path) return '';
  return path.replace(/^\/Users\/[^/]+/, '~');
};

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

watchEffect(() => {
  if (customApps.value.length === 0) {
    setPageHeaderActions([]);
    return;
  }
  setPageHeaderActions([
    {
      id: 'custom-apps-add',
      label: 'Add App',
      variant: 'primary',
      disabled: loading.value,
      icon: IconPlus,
      onClick: () => {
        showAddModal.value = true;
      },
    },
  ]);
});

onBeforeUnmount(() => {
  clearPageHeaderActions();
});
</script>
