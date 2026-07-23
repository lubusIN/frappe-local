<template>
  <section class="flex flex-col gap-6">
    <PageHeader class="[-webkit-app-region:drag]">
      <h1 class="text-xl-medium truncate text-ink-gray-9">
        My Apps
      </h1>
      <div
        v-if="customApps.length > 0"
        class="flex items-center gap-3 [-webkit-app-region:no-drag]"
      >
        <Button
          variant="solid"
          :disabled="loading"
          :icon-left="'lucide-plus'"
          @click="showAddModal = true"
        >
          Add
        </Button>
      </div>
    </PageHeader>

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
              <i
                v-else
                class="lucide-package size-4"
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
              side="bottom"
              align="end"
            >
              <template #default>
                <Button
                  size="md"
                  variant="subtle"
                  :icon="'lucide-more-horizontal'"
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
      :icon="'lucide-package'"
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

    <AppUsageDialog
      v-model:open="usageDialogOpen"
      :app-name="usageAppTitle"
      title="App in use"
      :usage="usageData"
    />
  </section>
</template>

<script setup lang="ts">
import { Badge, Button, Dropdown, toast } from 'frappe-ui';
import { ref } from 'vue';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import ResourceListView from '@frappe-local/renderer/components/ui/ResourceListView.vue';
import AddCustomAppModal from '@frappe-local/renderer/components/dialogs/AddCustomAppModal.vue';
import AppUsageDialog from '@frappe-local/renderer/components/dialogs/AppUsageDialog.vue';

import { useConfirmAction } from '@frappe-local/renderer/composables/ui';
import { PageHeader } from 'frappe-ui';

import { useCustomApps } from '@frappe-local/renderer/composables/data';
import { useEditorStatus } from '@frappe-local/renderer/composables/system';
import type { CustomAppListItem } from '@frappe-local/shared/core';

const { isEditorInstalled } = useEditorStatus();

const {
  customApps,
  loading,
  error,
  refresh,
  remove: deleteApp,
  checkAppUsage,
  openInEditor,
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

const getAppActions = (app: CustomAppListItem) => {
  const actions: Array<{
    label: string;
    icon?: unknown;
    theme?: 'red';
    disabled?: boolean;
    onClick: () => void;
  }> = [];

  if (app.type === 'local') {
    actions.push({
      label: 'Open in VS Code',
      icon: 'lucide-code',
      disabled: !isEditorInstalled.value,
      onClick: () => openInEditor(app.name || app.title || app.id, false),
    });
  }

  actions.push({
    label: 'Delete',
    icon: 'lucide-trash-2',
    theme: 'red' as const,
    onClick: () => onDeleteClick(app.id, app.title || app.name),
  });

  return actions;
};

const usageDialogOpen = ref(false);
const usageAppTitle = ref('');
const usageData = ref({ benches: [] as string[], sites: [] as string[] });

const onDeleteClick = async (appId: string, appName: string) => {
  try {
    const usage = await checkAppUsage(appId);
    if (usage.inUse) {
      usageAppTitle.value = appName;
      usageData.value = { benches: usage.benches, sites: usage.sites };
      usageDialogOpen.value = true;
      return;
    }
    
    // Not in use, safe to confirm deletion
    confirmDelete(appId, appName);
  } catch {
    toast.error('Failed to check app usage');
  }
};

const onConfirmDelete = async () => {
  if (!deleteAppId.value) return;
  const id = deleteAppId.value;
  const name = deleteAppName.value;
  cancelDelete();
  try {
    const promise = deleteApp(id);
    toast.promise(promise, {
      loading: `Removing app ${name}...`,
      success: `Removed app ${name}`,
      error: `Failed to remove app ${name}`
    });
    await promise;
  } catch {
    // handled by toast
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
</script>
