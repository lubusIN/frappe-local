<template>
  <section class="flex flex-col gap-6">
    <StatePanel
      v-if="error && benches.length === 0"
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

    <ResourceListView
      v-if="!error && benches.length > 0"
      :columns="benchColumns"
      :rows="benches"
      row-key="id"
      empty-title="No benches"
      empty-description="No benches are available."
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'name'">
          <div
            class="flex h-full min-w-0 cursor-pointer flex-col justify-center gap-0.5 group"
            @click="onManageBench(row.id)"
          >
            <div class="truncate text-sm font-medium transition-colors text-ink-gray-9 group-hover:text-ink-blue-3">
              {{ row.name }}
            </div>
            <div
              class="truncate text-xs text-ink-gray-5"
              :title="row.path"
            >
              {{ formatPath(row.path) }}
            </div>
          </div>
        </template>

        <template v-else-if="column.key === 'frappeVersion'">
          <span class="block truncate text-sm text-ink-gray-6">{{ row.frappeVersion }}</span>
        </template>

        <template v-else-if="column.key === 'status'">
          <div class="flex h-full items-center">
            <Badge
              variant="subtle"
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
            class="flex h-full items-center justify-end"
            @click.stop
          >
            <Dropdown :options="getBenchActions(row)">
              <template #default>
                <Button
                  size="md"
                  variant="subtle"
                  icon="more-horizontal"
                />
              </template>
            </Dropdown>
          </div>
        </template>
      </template>
    </ResourceListView>

    <EmptyState
      v-if="!error && !loading && benches.length === 0"
      title="No benches found"
      description="Create a new bench to get started."
      :icon="IconPackage"
    >
      <Button
        variant="solid"
        @click="showCreateBenchModal = true"
      >
        Create Bench
      </Button>
    </EmptyState>

    <ConfirmationDialog
      :open="confirmCleanBenchOpen"
      title="Clean Bench"
      :message="`Are you sure you want to clear the site cache for &quot;${cleanBenchName}&quot;?`"
      confirm-label="Clean"
      @cancel="cancelCleanBench"
      @confirm="onConfirmCleanBench"
    />

    <ConfirmationDialog
      :open="confirmDeleteBenchOpen"
      title="Delete Bench"
      :message="`Are you sure you want to delete bench &quot;${deleteBenchName}&quot;? This cannot be undone.`"
      confirm-label="Delete"
      @cancel="cancelDeleteBench"
      @confirm="onConfirmDeleteBench"
    />

    <BenchWizardDialog
      v-model:open="showCreateBenchModal"
      @created="onBenchCreated"
    />

    <TaskLogDialog
      v-if="selectedTask"
      :task="selectedTask"
      @close="selectedTaskId = null"
    />

    <ManageAppsDialog
      v-model:open="showAppsDialog"
      :resource-name="selectedBenchForApps?.name || 'Bench'"
      context="bench"
      :active-app-ids="selectedBenchForApps?.apps ?? []"
      :disabled="!canMutateApps || updating"
      :warning-message="benchAppsWarningMessage"
      :frappe-version="selectedBenchForApps?.frappeVersion"
      :loading-app-id="updating ? pendingRemoveBenchAppId || 'adding' : null"
      @close="closeAppsDialog"
      @add-app="onAddBenchApp"
      @remove-app="onRequestRemoveBenchApp"
    />

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
import { computed, onBeforeUnmount, ref, watch, watchEffect, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { Badge, Button, Dropdown, toast } from 'frappe-ui';
import ConfirmationDialog from '../components/dialogs/ConfirmationDialog.vue';
import IconPlus from '~icons/lucide/plus';
import IconExternalLink from '~icons/lucide/external-link';

import IconPlay from '~icons/lucide/play';
import IconSquare from '~icons/lucide/square';
import IconFolder from '~icons/lucide/folder';
import IconTerminal from '~icons/lucide/terminal';
import IconTrash from '~icons/lucide/trash-2';
import IconBrushCleaning from '~icons/lucide/brush-cleaning';
import IconActivity from '~icons/lucide/activity';
import IconRotateCw from '~icons/lucide/rotate-cw';
import IconPackage from '~icons/lucide/package';

import StatePanel from '../components/ui/StatePanel.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import ResourceListView from '../components/ui/ResourceListView.vue';
import ManageAppsDialog from '../components/dialogs/ManageAppsDialog.vue';
import TaskLogDialog from '../components/dialogs/TaskLogDialog.vue';

import { useConfirmAction } from '../composables/ui/useConfirmAction';
import { usePageHeaderActions } from '../composables/ui/usePageHeaderActions';
import { useProgressCenter } from '../composables/system/useProgressCenter';
import { useResourceTaskState } from '../composables/system/useResourceTaskState';
import { useAppCatalog } from '../composables/data/useAppCatalog';
import { useBenches } from '../composables/data/useBenches';
import BenchWizardDialog from '../components/dialogs/BenchWizardDialog.vue';
import type { BenchListItem } from '../../shared/core/ipc';


const {
  benches,
  loading,
  updating,
  deleting,
  openingFolder,
  error,
  successMessage,
  update,
  remove: deleteBench,
  openFolder,
  openShell,
  cleanSites: cleanBench,
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

const { getAppInfo } = useAppCatalog();
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

const benchAppsWarningMessage = computed(() => {
  const bench = selectedBenchForApps.value;
  if (!bench) return null;
  if (bench.status !== 'running') return 'Start the bench before managing apps.';
  if (isResourceBusy(bench.id)) return 'App orchestration is currently in progress. Please wait.';
  return null;
});

const canMutateApps = computed(() => benchAppsWarningMessage.value === null);

const normalizeSelection = (selectedIds: readonly string[]): string[] =>
  Array.from(new Set(selectedIds.map((id) => id.trim()).filter(Boolean)));

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
  toast.info(`Getting app ${appId} for bench ${bench.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(bench.id); },
    },
  });
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
  toast.info(`Removing app from bench ${bench.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(bench.id); },
    },
  });
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

const benchColumns = [
  { label: 'Bench', key: 'name', width: 'minmax(240px, 2fr)' },
  { label: 'Frappe version', key: 'frappeVersion', width: 'minmax(140px, 1fr)' },
  { label: 'Status', key: 'status', width: '140px' },
  { label: '', key: 'actions', width: '48px', align: 'right' },
] satisfies object[];

const { tasks, acknowledgedTasks } = useProgressCenter();

const {
  setPendingAction: setPendingBenchAction,
  getPendingAction: getPendingBenchAction,
  clearPendingAction: clearPendingBenchAction,
  isResourceBusy,
  formatStatusLabel,
  getStatusTheme,
  getLatestRelevantTaskId,
} = useResourceTaskState('bench', computed(() => tasks.value || []));

const {
  isOpen: confirmDeleteBenchOpen,
  pendingId: deleteBenchId,
  pendingName: deleteBenchName,
  open: confirmDeleteBench,
  cancel: cancelDeleteBench,
} = useConfirmAction();

const {
  isOpen: confirmCleanBenchOpen,
  pendingId: cleanBenchId,
  pendingName: cleanBenchName,
  open: confirmCleanBench,
  cancel: cancelCleanBench,
} = useConfirmAction();

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
        label: 'Open Shell',
        icon: IconTerminal,
        disabled: bench.status !== 'running',
        onClick: () => onOpenBenchShell(bench.id),
      },
      {
        label: 'Clean Bench',
        icon: IconBrushCleaning,
        disabled: updating.value || (bench.status !== 'running' && bench.status !== 'success') || isBusy,
        onClick: () => confirmCleanBench(bench.id, bench.name),
      },
      {
        label: 'Delete',
        icon: IconTrash,
        theme: 'red' as const,
        disabled: updating.value || deleting.value || bench.status === 'running' || isBusy,
        onClick: () => confirmDeleteBench(bench.id, bench.name),
      },
    ];

  return actions.filter(a => !a.hidden);
};


const selectedTaskId = ref<string | null>(null);

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
        task.resource === 'bench' &&
        task.taskName.match(/^App .* (installation|uninstallation) on /i) &&
        (task.status === 'success' || task.status === 'failure') &&
        !acknowledgedTasks.has(task.taskId)
      ) {
        acknowledgedTasks.add(task.taskId);
        void refresh(true);

        if (task.status === 'success') {
          const actionVerb = task.taskName.includes('installation') ? 'installed' : 'uninstalled';
          const msg = task.taskName.replace('installation', actionVerb).replace('uninstallation', actionVerb);
          toast.success(msg);
        }
      }
    }
  },
  { deep: true }
);

const showCreateBenchModal = ref(false);

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

watchEffect(() => {
  if (benches.value.length === 0) {
    setPageHeaderActions([]);
    return;
  }
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
      toast.info(`Restarting bench ${name}`, {
        action: { label: 'View progress', onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(id); } },
      });
    } else {
      toast.info(`Starting bench ${name}`, {
        action: { label: 'View progress', onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(id); } },
      });
    }
    setPendingBenchAction(id, currentStatus === 'running' ? 'restarting' : 'starting');
  } else {
    toast.info(`Stopping bench ${name}`, {
      action: { label: 'View progress', onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(id); } },
    });
    setPendingBenchAction(id, 'stopping');
  }

  try {
    await update(id, { status });
  } catch {
    clearPendingBenchAction(id);
  }
};

const onConfirmDeleteBench = async () => {
  if (!deleteBenchId.value) return;
  try {
    toast.info(`Deleting bench ${deleteBenchName.value}`, {
      action: { label: 'View progress', onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(deleteBenchId.value!); } },
    });
    await deleteBench(deleteBenchId.value);
    cancelDeleteBench();
  } catch (err) {
    console.error(err);
  }
};

const onConfirmCleanBench = async () => {
  if (!cleanBenchId.value) return;
  try {
    await cleanBench(cleanBenchId.value);
    cancelCleanBench();
  } catch (err) {
    console.error(err);
  }
};

const onOpenBenchFolder = async (id: string) => {
  await openFolder(id);
};

const onBenchCreated = async (bench: BenchListItem) => {
  toast.info(`Creating bench ${bench.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(bench.id); }
    }
  });
  await refresh(true);
};

const onOpenBenchShell = async (id: string) => {
  await openShell(id);
};
</script>
