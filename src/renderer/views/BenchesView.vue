<template>
  <section class="flex flex-col gap-6">
    <StatePanel
      v-if="error && !benches.length"
      kind="error"
      title="Unable to load benches"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />

    <StatePanel
      v-if="!error && loading && benches.length === 0"
      kind="loading"
      title="Loading benches"
      body="Fetching the latest bench list and lifecycle state."
    />

    <ListView
      v-if="!error && (!loading || benches.length > 0) && benches.length"
      :columns="benchColumns"
      :rows="benches"
      row-key="id"
      :options="benchListOptions"
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'name'">
          <div
            class="py-3 cursor-pointer group"
            @click="onManageBench(row.id)"
          >
            <div class="font-medium transition-colors text-ink-gray-9 group-hover:text-ink-blue-3">
              {{ row.name }}
            </div>
            <div
              class="text-xs truncate text-ink-gray-5"
              :title="row.path"
            >
              {{ formatPath(row.path) }}
            </div>
          </div>
        </template>

        <template v-else-if="column.key === 'frappeVersion'">
          <span class="text-sm text-ink-gray-6">{{ row.frappeVersion }}</span>
        </template>

        <template v-else-if="column.key === 'appCount'">
          <span class="text-sm text-ink-gray-6">{{ row.appCount }}</span>
        </template>

        <template v-else-if="column.key === 'status'">
          <div class="flex items-center">
            <Badge
              :variant="'subtle'"
              :theme="getStatusTheme(row)"
              class="inline-flex cursor-pointer items-center gap-1.5"
              @click.stop="onStatusClick(row.id)"
            >
              {{ formatStatusLabel(row) }}
              <span
                v-if="isResourceBusy(row.id)"
                class="inline-block size-2.5 rounded-full border-[1.5px] border-current border-r-transparent animate-spin"
              />
            </Badge>
          </div>
        </template>

        <template v-else-if="column.key === 'actions'">
          <div
            class="flex justify-end"
            @click.stop
          >
            <Dropdown :options="getBenchActions(row)">
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
    </ListView>

    <section
      v-if="!error && (!loading || benches.length > 0) && !benches.length"
      class="flex min-h-[300px] flex-col items-center justify-center bg-white px-12 text-center"
    >
      <h2 class="m-0 text-lg font-semibold text-ink-gray-9">
        No benches found
      </h2>
      <p class="mt-2 mb-6 text-sm text-ink-gray-6">
        Create a new bench to get started.
      </p>
      <Button
        variant="solid"
        @click="showCreateBenchModal = true"
      >
        Create Bench
      </Button>
    </section>

    <ConfirmationDialog
      :open="cleanConfirmOpen"
      title="Clean bench"
      :message="`Are you sure you want to clean all sites from bench &quot;${pendingCleanBenchName}&quot;? This will drop all databases and remove all site data.`"
      confirm-label="Clean bench"
      @cancel="onCancelClean"
      @confirm="onConfirmClean"
    />

    <ConfirmationDialog
      :open="deleteConfirmOpen"
      title="Delete bench"
      :message="`Delete bench ${pendingDeleteBenchName}? This cannot be undone.`"
      confirm-label="Delete bench"
      @cancel="onCancelDelete"
      @confirm="onConfirmDelete"
    />

    <BenchWizardDialog
      v-model:open="showCreateBenchModal"
      @created="refresh(true)"
    />
    <Dialog
      v-model="showAppPicker"
      :options="{ title: 'Select Apps', size: '2xl' }"
    >
      <template #body-content>
        <div class="flex flex-col h-full min-h-0 overflow-hidden">
          <AppPicker
            v-model="createForm.appsSelected"
            :disabled="creating || loading"
            :frappe-version="createForm.frappeVersion"
            :disable-core-bench-apps="true"
          />
        </div>
      </template>
      <template #actions>
        <div class="flex justify-end gap-3">
          <Button
            size="md"
            variant="solid"
            @click="showAppPicker = false"
          >
            Done
          </Button>
        </div>
      </template>
    </Dialog>

    <TaskLogModal
      v-if="selectedTask"
      :task="selectedTask"
      @close="selectedTaskId = null"
    />

    <Dialog
      v-model="showCreateFailureDialog"
      :options="{ title: createFailureTitle, size: 'md' }"
    >
      <template #body-content>
        <p class="text-sm text-ink-gray-7">
          {{ createFailureMessage }}
        </p>
      </template>
      <template #actions>
        <div class="flex justify-end gap-3">
          <Button
            size="md"
            variant="solid"
            @click="showCreateFailureDialog = false"
          >
            OK
          </Button>
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model="showAppsDialog"
      :options="{ title: `Manage Apps in ${selectedBenchForApps?.name || 'Bench'}`, size: '4xl' }"
      @close="closeAppsDialog"
    >
      <template #body-content>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col min-h-0 gap-3 pt-6">
            <AppManager
              context="bench"
              :active-app-ids="selectedBenchForApps?.apps ?? []"
              :disabled="!canMutateApps || updating"
              :frappe-version="selectedBenchForApps?.frappeVersion"
              :loading-app-id="updating ? pendingRemoveBenchAppId || 'adding' : null"
              @add-app="onAddBenchApp"
              @remove-app="onRequestRemoveBenchApp"
            />
          </div>
          <p
            v-if="selectedBenchForApps && selectedBenchForApps.status !== 'running'"
            class="text-sm text-ink-amber-4"
          >
            Start the bench before managing apps.
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex justify-end gap-3">
          <Button
            size="md"
            variant="solid"
            @click="closeAppsDialog"
          >
            Close
          </Button>
        </div>
      </template>
    </Dialog>

    <ConfirmationDialog
      :open="removeAppConfirmOpen"
      title="Remove app"
      :message="removeAppConfirmMessage"
      confirm-label="Remove app"
      @cancel="onCancelRemoveBenchApp"
      @confirm="onConfirmRemoveBenchApp"
    />
  </section>
</template>

  <script setup lang="ts">
  import { computed, onBeforeUnmount, reactive, ref, watch, watchEffect, type Component } from 'vue';
  import { useRouter } from 'vue-router';
  import { Badge, Button, Dialog, Dropdown, ListView, toast } from 'frappe-ui';
  import IconPlus from '~icons/lucide/plus';
  import IconExternalLink from '~icons/lucide/external-link';
  
  import IconPlay from '~icons/lucide/play';
  import IconSquare from '~icons/lucide/square';
  import IconFolder from '~icons/lucide/folder';
  import IconTrash from '~icons/lucide/trash-2';
  import IconBrushCleaning from '~icons/lucide/brush-cleaning';
  import IconActivity from '~icons/lucide/activity';
  import IconRotateCw from '~icons/lucide/rotate-cw';
  import IconMoreHorizontal from '~icons/lucide/more-horizontal';
  import IconPackage from '~icons/lucide/package';
import AppManager from '../components/AppManager.vue';
import AppPicker from '../components/AppPicker.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import StatePanel from '../components/StatePanel.vue';
import TaskLogModal from '../components/TaskLogModal.vue';

import { useBenches } from '../composables/useBenches';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import { useProgressCenter } from '../composables/useProgressCenter';
import { useResourceTaskState } from '../composables/useResourceTaskState';
import { useAppCatalog } from '../composables/useAppCatalog';
import BenchWizardDialog from '../components/BenchWizardDialog.vue';
import type { BenchListItem, CatalogAppItem } from '../../shared/ipc';

import { normalizeSelection } from '../app-picker-state';
import { humanizeCreateFailure } from '../../shared/runtime-errors';

const {
  benches,
  loading,
  creating,
  updating,
  deleting,
  openingFolder,
  error,
  successMessage,
  update,
  remove,
  openFolder,
  cleanSites,
  refresh,
} = useBenches();

watch(successMessage, (msg) => {
  if (msg) {
    toast.success(msg);
    successMessage.value = null;
  }
});

watch(error, (err) => {
  if (err) {
    toast.error(err);
    error.value = null;
  }
});

const { state: catalogState } = useAppCatalog();
const showAppsDialog = ref(false);
const selectedBenchForAppsId = ref<string | null>(null);
const removeAppConfirmOpen = ref(false);
const pendingRemoveBenchAppId = ref<string | null>(null);
const pendingRemoveBenchAppName = ref('');

const selectedBenchForApps = computed(
  () => benches.value.find((bench) => bench.id === selectedBenchForAppsId.value) ?? null,
);

const onShowApps = (bench: BenchListItem) => {
  selectedBenchForAppsId.value = bench.id;
  showAppsDialog.value = true;
};

const closeAppsDialog = () => {
  showAppsDialog.value = false;
  selectedBenchForAppsId.value = null;
  removeAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;
  pendingRemoveBenchAppName.value = '';
};

const canMutateApps = computed(() => selectedBenchForApps.value?.status === 'running');

const getAppInfo = (appId: string) => {
  return catalogState.value.data?.find((app) => app.id === appId) ?? ({
    id: appId,
    name: appId,
    description: '',
    source: '',
    version: '',
    category: 'other',
    compatibility: {},
  } satisfies CatalogAppItem);
};

const queueBenchAppsUpdate = async (nextApps: readonly string[]) => {
  const bench = selectedBenchForApps.value;
  if (!bench) {
    return;
  }

  const normalizedNextApps = normalizeSelection(nextApps);
  const currentApps = normalizeSelection(bench.apps);
  const sameApps = normalizedNextApps.length === currentApps.length && normalizedNextApps.every((appId, index) => appId === currentApps[index]);
  if (sameApps) {
    return;
  }

  await update(bench.id, { apps: normalizedNextApps });
};

const onAddBenchApp = async (appId: string) => {
  const bench = selectedBenchForApps.value;
  if (!bench || !canMutateApps.value) {
    return;
  }

  const nextApps = normalizeSelection([...bench.apps, appId]);
  pendingRemoveBenchAppId.value = appId;
  toast.success(`Installing app ${appId} to bench ${bench.name}...`);
  await queueBenchAppsUpdate(nextApps);
  closeAppsDialog();
};

const onRequestRemoveBenchApp = (appId: string) => {
  const bench = selectedBenchForApps.value;
  if (!bench || !canMutateApps.value) {
    return;
  }

  const appInfo = getAppInfo(appId);
  pendingRemoveBenchAppId.value = appId;
  pendingRemoveBenchAppName.value = appInfo.name;
  removeAppConfirmOpen.value = true;
};

const onCancelRemoveBenchApp = () => {
  removeAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;
  pendingRemoveBenchAppName.value = '';
};

const removeAppConfirmMessage = computed(() => {
  const bench = selectedBenchForApps.value;
  if (!bench) {
    return 'Remove this app from the bench?';
  }

  return `Remove ${pendingRemoveBenchAppName.value} from bench "${bench.name}"? This will update the bench app list and remove the app from the bench.`;
});

const onConfirmRemoveBenchApp = async () => {
  const bench = selectedBenchForApps.value;
  const appId = pendingRemoveBenchAppId.value;
  if (!bench || !appId || !canMutateApps.value) {
    onCancelRemoveBenchApp();
    return;
  }

  removeAppConfirmOpen.value = false;

  const nextApps = bench.apps.filter((existingAppId) => existingAppId !== appId);
  toast.success(`Removing app from bench ${bench.name}...`);
  await queueBenchAppsUpdate(nextApps);
  closeAppsDialog();
};

const router = useRouter();

const onManageBench = (id: string) => {
  router.push({ name: 'sites', query: { benchId: id } });
};


const formatPath = (path: string) => {
  if (!path) return '';
  return path.replace(/^\/Users\/[^/]+/, '~');
};

const benchColumns = reactive([
  { label: 'Name', key: 'name', width: 2 },
  { label: 'Frappe', key: 'frappeVersion', width: 1.2 },
  { label: 'Status', key: 'status', width: 1 },
  { label: '', key: 'actions', width: 0.5 },
]);

const { tasks } = useProgressCenter();

const {
  setPendingAction: setPendingBenchAction,
  getPendingAction: getPendingBenchAction,
  clearPendingAction: clearPendingBenchAction,
  isResourceBusy,
  formatStatusLabel,
  getStatusTheme,
  getLatestRelevantTaskId,
} = useResourceTaskState('bench', computed(() => tasks.value || []));

const benchListOptions = {
  selectable: false,
  showTooltip: true,
  resizeColumn: true,
};

const getBenchActions = (bench: BenchListItem) => {
  const isBusy = isResourceBusy(bench.id) || Boolean(getPendingBenchAction(bench.id));

  const actions: Array<{
    label: string;
    icon: Component;
    disabled?: boolean;
    theme?: 'gray' | 'red';
    hidden?: boolean;
    onClick: () => void | Promise<void>;
  }> = [
    {
      label: 'Sites',
      icon: IconExternalLink,
      onClick: () => onManageBench(bench.id),
    },
    {
      label: 'View Progress',
      icon: IconActivity,
      onClick: () => onStatusClick(bench.id),
      hidden: !isBusy,
    },
    {
      label: bench.status === 'running' ? 'Restart' : 'Start',
      icon: bench.status === 'running' ? IconRotateCw : IconPlay,
      disabled: updating.value || isBusy || bench.status === 'queued',
      onClick: () => onSetBenchStatus(bench.id, 'running', bench.status),
    },
    {
      label: 'Stop',
      icon: IconSquare,
      disabled: updating.value || bench.status === 'stopped' || bench.status === 'queued' || isBusy,
      onClick: () => onStopBench(bench.id),
    },
    {
      label: 'Apps',
      icon: IconPackage,
      onClick: () => onShowApps(bench),
    },
    {
      label: 'Open Folder',
      icon: IconFolder,
      disabled: openingFolder.value,
      onClick: () => onOpenBenchFolder(bench.id),
    },
    {
      label: 'Clean Bench',
      icon: IconBrushCleaning,
      disabled: updating.value || (bench.status !== 'running' && bench.status !== 'success') || isBusy,
      onClick: () => onCleanBench(bench.id, bench.name),
    },
    {
      label: 'Delete',
      icon: IconTrash,
      theme: 'red' as const,
      disabled: updating.value || deleting.value || bench.status === 'running' || isBusy,
      onClick: () => onDeleteBench(bench.id, bench.name),
    },
  ];

  return actions.filter(a => !a.hidden);
};


const selectedTaskId = ref<string | null>(null);
const showCreateFailureDialog = ref(false);
const createFailureTitle = ref('Bench Creation Failed');
const createFailureMessage = ref('Bench creation failed. Check Progress for details.');
const acknowledgedCreateFailures = ref(new Set<string>());

// Reset error dialog and acknowledgments when starting a new bench creation
watch(creating, (isCreating) => {
  if (isCreating) {
    showCreateFailureDialog.value = false;
    createFailureTitle.value = 'Bench Creation Failed';
    createFailureMessage.value = 'Bench creation failed. Check Progress for details.';
    acknowledgedCreateFailures.value.clear();
  }
});

// Also reset after a successful creation
watch(successMessage, (msg) => {
  if (msg && msg.toLowerCase().includes('created')) {
    showCreateFailureDialog.value = false;
    createFailureTitle.value = 'Bench Creation Failed';
    createFailureMessage.value = 'Bench creation failed. Check Progress for details.';
    acknowledgedCreateFailures.value.clear();
  }
});
const acknowledgedBenchAppTaskResults = ref(new Set<string>());

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});


const onStatusClick = (resourceId: string) => {
  selectedTaskId.value = getLatestRelevantTaskId(resourceId);
};

watch(
  tasks,
  (items) => {
    for (const task of items) {
      if (
        task.status === 'failure' &&
        task.resource === 'bench' &&
        task.taskName.toLowerCase().includes('create bench') &&
        !acknowledgedCreateFailures.value.has(task.taskId)
      ) {
        acknowledgedCreateFailures.value.add(task.taskId);
        createFailureTitle.value = 'Bench Creation Failed';
        createFailureMessage.value = humanizeCreateFailure('bench', task.message);
        showCreateFailureDialog.value = true;
      }

      if (
        task.resource === 'bench' &&
        task.taskName.toLowerCase().includes('update bench apps') &&
        (task.status === 'success' || task.status === 'failure') &&
        !acknowledgedBenchAppTaskResults.value.has(task.taskId)
      ) {
        acknowledgedBenchAppTaskResults.value.add(task.taskId);
        const benchName = benches.value.find((bench) => bench.id === task.resourceId)?.name
          ?? task.taskName.replace(/^Update Bench Apps\s+/i, '').trim();

        void refresh(true);

        if (task.status === 'success') {
          toast.success(`Bench apps updated for ${benchName}.`);
        } else {
          toast.error(`App update failed for ${benchName}. Check progress logs.`);
          selectedTaskId.value = task.taskId;
        }
      }
    }
  },
  { deep: true }
);
const showAppPicker = ref(false);
const showCreateBenchModal = ref(false);

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

watchEffect(() => {
  setPageHeaderActions([
    {
      id: 'benches-create',
      label: 'Create',
      variant: 'primary',
      disabled: loading.value,
      icon: IconPlus,
      onClick: () => {
        showCreateBenchModal.value = true;
      },
    },
  ]);
});

onBeforeUnmount(() => {
  clearPageHeaderActions();
});



const onStopBench = async (id: string) => {
  await onSetBenchStatus(id, 'stopped');
};

const onSetBenchStatus = async (id: string, status: 'running' | 'stopped', currentStatus?: string) => {
  const bench = benches.value.find(b => b.id === id);
  const name = bench ? bench.name : '';
  
  if (status === 'running') {
    if (currentStatus === 'running') {
      toast.success(`Restarting bench ${name}...`);
    } else {
      toast.success(`Starting bench ${name}...`);
    }
    setPendingBenchAction(id, currentStatus === 'running' ? 'restarting' : 'starting');
  } else {
    toast.success(`Stopping bench ${name}...`);
    setPendingBenchAction(id, 'stopping');
  }

  try {
    await update(id, { status });
  } catch {
    clearPendingBenchAction(id);
  }
};

const deleteConfirmOpen = ref(false);
const pendingDeleteBenchId = ref<string | null>(null);
const pendingDeleteBenchName = ref('');

const onDeleteBench = async (id: string, name: string) => {
  pendingDeleteBenchId.value = id;
  pendingDeleteBenchName.value = name;
  deleteConfirmOpen.value = true;
};

const onCancelDelete = (): void => {
  deleteConfirmOpen.value = false;
  pendingDeleteBenchId.value = null;
  pendingDeleteBenchName.value = '';
};

const onConfirmDelete = async (): Promise<void> => {
  const id = pendingDeleteBenchId.value;
  const name = pendingDeleteBenchName.value;
  if (!id) {
    onCancelDelete();
    return;
  }

  deleteConfirmOpen.value = false;
  toast.success(`Deleting bench ${name}...`);
  await remove(id);
  onCancelDelete();
};

const cleanConfirmOpen = ref(false);
const pendingCleanBenchId = ref<string | null>(null);
const pendingCleanBenchName = ref('');

const onCleanBench = (id: string, name: string) => {
  pendingCleanBenchId.value = id;
  pendingCleanBenchName.value = name;
  cleanConfirmOpen.value = true;
};

const onCancelClean = () => {
  cleanConfirmOpen.value = false;
  pendingCleanBenchId.value = null;
  pendingCleanBenchName.value = '';
};

const onConfirmClean = async () => {
  const id = pendingCleanBenchId.value;
  if (!id) {
    onCancelClean();
    return;
  }

  cleanConfirmOpen.value = false;
  await cleanSites(id);
  onCancelClean();
};

const onOpenBenchFolder = async (id: string) => {
  await openFolder(id);
};
</script>

<style scoped>
:deep(.frappe-list-cell) {
  min-width: 0 !important;
}

/* Keep Select Apps modal capped to viewport while letting its list scroll internally. */
:deep(.dialog-overlay[data-dialog="Select Apps"] .dialog-content) {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

:deep(.dialog-overlay[data-dialog="Select Apps"] .dialog-content > div:first-child) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.dialog-overlay[data-dialog="Select Apps"] .dialog-content > div:last-child) {
  flex-shrink: 0;
}
</style>
