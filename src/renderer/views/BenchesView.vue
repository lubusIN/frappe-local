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
            <div class="truncate text-sm-medium transition-colors text-ink-gray-9 group-hover:text-ink-blue-6">
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
            <Dropdown
              :options="getBenchActions(row)"
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
import { Badge, Button, Dropdown, toast } from 'frappe-ui';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconPackage from '~icons/lucide/package';
import IconExternalLink from '~icons/lucide/external-link';
import IconActivity from '~icons/lucide/activity';
import IconRotateCw from '~icons/lucide/rotate-cw';
import IconPlay from '~icons/lucide/play';
import IconSquare from '~icons/lucide/square';
import IconFolder from '~icons/lucide/folder';
import IconTerminal from '~icons/lucide/terminal';
import IconBrushCleaning from '~icons/lucide/brush-cleaning';
import IconTrash2 from '~icons/lucide/trash2';
import IconPlus from '~icons/lucide/plus';
import { computed, onBeforeUnmount, ref, type Component, watch, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';

import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import ResourceListView from '@frappe-local/renderer/components/ui/ResourceListView.vue';
import ManageAppsDialog from '@frappe-local/renderer/components/dialogs/ManageAppsDialog.vue';

import { useConfirmAction, usePageHeaderActions } from '@frappe-local/renderer/composables/ui';

import { useProgressCenter, useResourceTaskState, runAndWaitForTask } from '@frappe-local/renderer/composables/system';

import { useAppCatalog, useBenches } from '@frappe-local/renderer/composables/data';

import BenchWizardDialog from '@frappe-local/renderer/components/dialogs/BenchWizardDialog.vue';
import type { BenchListItem } from '@frappe-local/shared/core';

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

const { getAppInfo, getAppTitle } = useAppCatalog();
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

  const promise = runAndWaitForTask(
    () => queueBenchAppsUpdate(nextApps),
    'bench', bench.id, /^(Get) app .* on /i
  ).then(async (res) => {
    await refresh(true);
    return res;
  });
  closeAppsDialog();

  const appTitle = getAppTitle(appId);
  toast.promise(promise, {
    loading: `Getting app ${appTitle} for bench ${bench.name}`,
    success: `Got app ${appTitle} on bench ${bench.name}`,
    error: `Failed to get app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(bench.id);
      },
    },
  });
};

const onRequestRemoveBenchApp = (appId: string) => {
  const bench = selectedBenchForApps.value;
  if (!bench || !canMutateApps.value) {
    return;
  }

  const appInfo = getAppInfo(appId);
  pendingRemoveBenchAppId.value = appId;
  pendingRemoveBenchAppName.value = getAppTitle(appId);
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
  const appTitle = pendingRemoveBenchAppName.value || appId;
  if (!bench || !appId || !canMutateApps.value) {
    onCancelRemoveBenchApp();
    return;
  }

  removeAppConfirmOpen.value = false;

  const nextApps = bench.apps.filter((existingAppId) => existingAppId !== appId);

  const promise = runAndWaitForTask(
    () => queueBenchAppsUpdate(nextApps),
    'bench', bench.id, /^(Remove) app .* on /i
  ).then(async (res) => {
    await refresh(true);
    return res;
  });
  closeAppsDialog();

  toast.promise(promise, {
    loading: `Removing app ${appTitle} from bench ${bench.name}`,
    success: `Removed app ${appTitle} from bench ${bench.name}`,
    error: `Failed to remove app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(bench.id);
      },
    },
  });
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

const { tasks, activeLogTaskId: selectedTaskId } = useProgressCenter();

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
        label: 'View logs',
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
        icon: IconTrash2,
        theme: 'red' as const,
        disabled: updating.value || deleting.value || bench.status === 'running' || isBusy,
        onClick: () => confirmDeleteBench(bench.id, bench.name),
      },
    ];

  return actions.filter(a => !a.hidden);
};



const onStatusClick = (resourceId: string) => {
  selectedTaskId.value = getLatestRelevantTaskId(resourceId);
};

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

  let loadingMsg = '';
  let successMsg = '';
  let errorMsg = '';
  let actionMatch: RegExp;

  if (status === 'running') {
    if (currentStatus === 'running') {
      loadingMsg = `Restarting bench ${name}`;
      successMsg = `Bench ${name} restarted.`;
      errorMsg = `Failed to restart bench ${name}.`;
      actionMatch = /^Restart bench/i;
      setPendingBenchAction(id, 'restarting');
    } else {
      loadingMsg = `Starting bench ${name}`;
      successMsg = `Bench ${name} started.`;
      errorMsg = `Failed to start bench ${name}.`;
      actionMatch = /^Start bench/i;
      setPendingBenchAction(id, 'starting');
    }
  } else {
    loadingMsg = `Stopping bench ${name}`;
    successMsg = `Bench ${name} stopped.`;
    errorMsg = `Failed to stop bench ${name}.`;
    actionMatch = /^Stop bench/i;
    setPendingBenchAction(id, 'stopping');
  }

  const promise = runAndWaitForTask(
    () => update(id, { status }),
    'bench', id, actionMatch
  );
  toast.promise(promise, {
    loading: loadingMsg,
    success: successMsg,
    error: errorMsg,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(id);
      }
    },
  });

  try {
    await promise;
  } catch {
    clearPendingBenchAction(id);
  }
};

const onConfirmDeleteBench = async () => {
  if (!deleteBenchId.value) return;
  const id = deleteBenchId.value;
  const name = deleteBenchName.value;
  cancelDeleteBench();
  try {
    const promise = runAndWaitForTask(
      () => deleteBench(id),
      'bench', id, /^Delete bench/i
    );
    toast.promise(promise, {
      loading: `Deleting bench ${name}`,
      success: `Bench ${name} deleted.`,
      error: `Failed to delete bench ${name}.`,
      action: {
        label: 'View logs',
        onClick: (e?: Event) => {
          e?.preventDefault();
          selectedTaskId.value = getLatestRelevantTaskId(id);
        }
      },
    });
    await promise;
  } catch {
    // handled by toast
  }
};

const onConfirmCleanBench = async () => {
  if (!cleanBenchId.value) return;
  const id = cleanBenchId.value;
  cancelCleanBench();
  try {
    await cleanBench(id);
  } catch {
    // handled by store
  }
};

const onOpenBenchFolder = async (id: string) => {
  await openFolder(id);
};

const onBenchCreated = async (bench: BenchListItem) => {
  void refresh(true);
  // For onBenchCreated we don't trigger the create action here, it was already triggered in the wizard
  // So we just pass a no-op Promise.resolve()
  const promise = runAndWaitForTask(() => Promise.resolve(), 'bench', bench.id, /^Create bench/i).then(() => refresh(true));
  toast.promise(promise, {
    loading: `Creating bench ${bench.name}`,
    success: `Bench ${bench.name} created.`,
    error: `Failed to create bench ${bench.name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(bench.id);
      }
    }
  });
};

const onOpenBenchShell = async (id: string) => {
  await openShell(id);
};
</script>
