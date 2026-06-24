<template>
  <section class="flex flex-col gap-6">
    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load sites"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />

    <FirstRunGuide
      v-if="!loading && !benchLoading && allBenches.length === 0"
      title="Create a bench before creating sites"
      body="Sites are attached to benches. Once you have one running bench, this screen becomes the main place to create, control, and export sites."
      :links="siteSetupLinks"
      compact
    />

    <!-- Creation Dialog -->
    <SiteWizardDialog
      v-model:open="showCreateSiteModal"
      @created="onSiteCreated"
    />

    <StatePanel
      v-if="!error && loading && sites.length === 0"
      kind="loading"
      title="Loading sites"
      body="Fetching sites and active status metadata."
    />

    <EmptyState
      v-if="!error && (!loading || sites.length > 0) && sites.length === 0"
      title="No sites yet"
      description="Create your first site to manage runtime status, inspect logs, and access dashboards."
      :icon="IconGlobe"
    >
      <div
        v-if="creatableBenches.length > 0"
        class="mt-6"
      >
        <Button
          variant="solid"
          @click="showCreateSiteModal = true"
        >
          Create site
        </Button>
      </div>
      <div v-else>
        <Button
          variant="subtle"
          @click="$router.push('/benches')"
        >
          Go to Benches
        </Button>
      </div>
    </EmptyState>

    <!-- Filters -->
    <div
      v-if="!error && sites.length > 0"
      class="flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <div class="flex flex-wrap items-center gap-3">
        <Select
          v-model="benchFilterSelection"
          class="flex-none min-w-36"
          :options="benchFilterOptions"
          variant="outline"
        />
        <Select
          v-model="statusFilterSelection"
          class="flex-none min-w-36"
          :options="statusFilterOptions"
          variant="outline"
        />
      </div>
      <div class="w-full sm:ml-auto sm:w-64">
        <TextInput
          v-model="siteFilters.search"
          type="search"
          placeholder="Search sites"
          variant="outline"
        >
          <template #prefix>
            <IconSearch class="w-4 text-ink-gray-5" />
          </template>
        </TextInput>
      </div>
    </div>

    <EmptyState
      v-if="!error && sites.length > 0 && filteredSites.length === 0"
      title="No matching sites"
      description="No sites match the current bench, status, or search filters."
      :icon="IconSearch"
    >
      <Button
        variant="subtle"
        @click="clearSiteFilters"
      >
        Clear filters
      </Button>
    </EmptyState>

    <ResourceListView
      v-if="!error && (!loading || sites.length > 0) && filteredSites.length > 0"
      :columns="siteColumns"
      :rows="filteredSites"
      row-key="id"
      empty-title="No sites"
      empty-description="No sites are available."
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'name'">
          <div class="flex items-center h-full min-w-0">
            <div class="text-sm-medium truncate text-ink-gray-9">
              {{ row.name }}
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'benchId'">
          <span class="block text-sm truncate text-ink-gray-6">{{ getBenchName(row.benchId) }}</span>
        </template>

        <template v-else-if="column.key === 'status'">
          <div class="flex items-center h-full">
            <Badge
              variant="subtle"
              :theme="getDisplayTheme(row)"
              class="inline-flex cursor-pointer items-center gap-1.5"
              @click.stop="onStatusClick(row.id)"
            >
              {{ getDisplayLabel(row) }}
              <span
                v-if="isResourceBusy(row.id)"
                class="inline-block size-2.5 rounded-full border-[1.5px] border-current border-r-transparent animate-spin"
              />
            </Badge>
          </div>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div
            class="flex items-center justify-end h-full"
            @click.stop
          >
            <Dropdown
              :options="getSiteActions(row)"
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

    <ConfirmationDialog
      :open="confirmDeleteSiteOpen"
      title="Delete Site"
      :message="`Are you sure you want to delete site &quot;${deleteSiteName}&quot;? This will remove all data and cannot be undone.`"
      confirm-label="Delete"
      @confirm="onConfirmDeleteSite"
      @cancel="cancelDeleteSite"
    />

    <TaskLogDialog
      v-if="selectedTask"
      :task="selectedTask"
      @close="selectedTaskId = null"
    />

    <ManageAppsDialog
      v-model:open="showSiteAppsDialog"
      :resource-name="selectedSiteForApps?.name || 'Site'"
      context="site"
      :active-app-ids="Array.from(siteActivatedAppSet)"
      :allowed-app-ids="benchInstalledAppRows"
      :disabled="updating || !canActivateSelectedSiteApps"
      :warning-message="siteAppsWarningMessage"
      :frappe-version="selectedBenchForSiteApps?.frappeVersion"
      :loading-app-id="activatingSiteAppId"
      @close="closeSiteAppsDialog"
      @add-app="onActivateSiteApp"
      @remove-app="onRequestDeactivateSiteApp"
      @manage-bench-apps="onManageParentBenchApps"
    />

    <ManageAppsDialog
      v-model:open="showBenchAppsDialog"
      :resource-name="selectedBenchForParentApps?.name || 'Bench'"
      context="bench"
      :active-app-ids="selectedBenchForParentApps?.apps ?? []"
      :disabled="!canMutateParentBenchApps || benchUpdating"
      :warning-message="parentBenchAppsWarningMessage"
      :frappe-version="selectedBenchForParentApps?.frappeVersion"
      :loading-app-id="benchUpdating ? pendingRemoveBenchAppId || 'adding' : null"
      @close="closeBenchAppsDialog"
      @add-app="onAddParentBenchApp"
      @remove-app="onRequestRemoveParentBenchApp"
    />

    <ConfirmationDialog
      :open="removeSiteAppConfirmOpen"
      title="Uninstall app"
      :message="`Are you sure you want to uninstall &quot;${pendingRemoveSiteAppName}&quot; from site &quot;${selectedSiteForApps?.name}&quot;? This will drop the app's database tables and delete all associated data.`"
      confirm-label="Uninstall"
      @cancel="onCancelDeactivateSiteApp"
      @confirm="onConfirmDeactivateSiteApp"
    />

    <ConfirmationDialog
      :open="removeBenchAppConfirmOpen"
      title="Remove app"
      :message="removeBenchAppConfirmMessage"
      confirm-label="Remove app"
      @cancel="onCancelRemoveParentBenchApp"
      @confirm="onConfirmRemoveParentBenchApp"
    />
  </section>
</template>

<script setup lang="ts">
import { Badge, Button, Dropdown, Select, TextInput, toast } from 'frappe-ui';
import IconGlobe from '~icons/lucide/globe';
import IconSearch from '~icons/lucide/search';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconExternalLink from '~icons/lucide/external-link';
import IconActivity from '~icons/lucide/activity';
import IconFolderOpen from '~icons/lucide/folder-open';
import IconPackage from '~icons/lucide/package';
import IconTrash2 from '~icons/lucide/trash2';
import IconPlus from '~icons/lucide/plus';
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component, watch } from 'vue';
import { useRoute } from 'vue-router';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';

import FirstRunGuide, { type FirstRunGuideLink } from '@frappe-local/renderer/components/FirstRunGuide.vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import ResourceListView from '@frappe-local/renderer/components/ui/ResourceListView.vue';
import ManageAppsDialog from '@frappe-local/renderer/components/dialogs/ManageAppsDialog.vue';
import TaskLogDialog from '@frappe-local/renderer/components/dialogs/TaskLogDialog.vue';
import SiteWizardDialog from '@frappe-local/renderer/components/dialogs/SiteWizardDialog.vue';
import { useIpc, useProgressCenter, useResourceTaskState } from '@frappe-local/renderer/composables/system';
import { useAppCatalog, useBenches, useSites } from '@frappe-local/renderer/composables/data';

import { usePageHeaderActions } from '@frappe-local/renderer/composables/ui';

import { filterSites, isCompletedSiteAppUpdateTask, isCompletedSiteCreationTask } from '@frappe-local/renderer/utils/sites';

import type { BenchListItem, SiteListItem } from '@frappe-local/shared/core';

const ipc = useIpc();
const route = useRoute();

const {
  sites,
  loading,
  updating,
  deleting,
  error,
  successMessage,
  update,
  remove,
  refresh: load,
  openFolder,
} = useSites();

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

onBeforeUnmount(() => {
  clearPageHeaderActions();
});

const { tasks, acknowledgedTasks } = useProgressCenter();
const selectedTaskId = ref<string | null>(null);
const showSiteAppsDialog = ref(false);
const selectedSiteForAppsId = ref<string | null>(null);
const activatingSiteAppId = ref<string | null>(null);

const refresh = async (force = false) => {
  await load(force);
};

const onSiteCreated = async (site: SiteListItem) => {
  toast.info(`Creating site ${site.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(site.id); }
    }
  });
  await refresh(true);
};

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

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});

const {
  getPendingAction: getPendingSiteAction,
  isResourceBusy,
  formatStatusLabel,
  getStatusTheme,
  getLatestRelevantTaskId,
} = useResourceTaskState('site', computed(() => tasks.value || []));

const {
  isResourceBusy: isBenchResourceBusy,
  getLatestRelevantTaskId: getLatestRelevantBenchTaskId,
} = useResourceTaskState('bench', computed(() => tasks.value || []));

const onStatusClick = (resourceId: string) => {
  selectedTaskId.value = getLatestRelevantTaskId(resourceId);
};

watch(
  tasks,
  (items) => {
    for (const task of items) {
      if (
        isCompletedSiteCreationTask(task) &&
        !acknowledgedTasks.has(task.taskId)
      ) {
        acknowledgedTasks.add(task.taskId);
        const siteName = sites.value.find((site) => site.id === task.resourceId)?.name
          ?? task.taskName.replace(/^Create Site:\s*/i, '').trim();

        void refresh();

        if (task.status === 'success' && task.resourceId) {
          toast.success(`Site ${siteName} created.`, {
            duration: 10000,
            action: {
              label: 'View site',
              altText: `Open ${siteName}`,
              onClick: () => {
                void ipc.openSiteExternal(task.resourceId!).then((opened) => {
                  if (!opened) {
                    toast.error(`Unable to open ${siteName}.`);
                  }
                });
              },
            },
          });
        }

        continue;
      }

      if (
        isCompletedSiteAppUpdateTask(task) &&
        !acknowledgedTasks.has(task.taskId)
      ) {
        acknowledgedTasks.add(task.taskId);
        void refresh();

        if (task.status === 'success') {
          const actionVerb = task.taskName.toLowerCase().startsWith('install') ? 'Installed' : 'Uninstalled';
          const msg = task.taskName.replace(/^(Install|Uninstall)/i, actionVerb);
          toast.success(msg);
        }
      }
    }
  },
  { deep: true }
);

const SELECT_ALL = '__all__';

const siteColumns = [
  { key: 'name', label: 'Site', width: 'minmax(200px, 2fr)' },
  { key: 'benchId', label: 'Bench', width: 'minmax(140px, 1fr)' },
  { key: 'status', label: 'Status', width: '140px' },
  { key: 'actions', label: '', width: '48px', align: 'right' },
] satisfies object[];

const {
  benches: allBenches,
  loading: benchLoading,
  updating: benchUpdating,
  update: updateBench,
  refresh: refreshBenches,
} = useBenches();

const getDisplayTheme = (row: SiteListItem) => {
  if (row.status === 'ready') {
    const benchStatus = allBenches.value.find((b) => b.id === row.benchId)?.status;
    if (benchStatus !== 'running') {
      return 'gray';
    }
  }
  return getStatusTheme(row);
};

const getDisplayLabel = (row: SiteListItem) => {
  if (row.status === 'ready') {
    const benchStatus = allBenches.value.find((b) => b.id === row.benchId)?.status;
    if (benchStatus !== 'running') {
      return 'Offline';
    }
  }
  return formatStatusLabel(row);
};

const getSiteActions = (site: SiteListItem) => {
  const isBenchRunning = allBenches.value.find((b) => b.id === site.benchId)?.status === 'running';
  const actions: Array<{
    label: string;
    icon: Component;
    disabled?: boolean;
    hidden?: boolean;
    theme?: 'gray' | 'red';
    onClick: () => void | Promise<void>;
  }> = [];

  if (site.status === 'ready') {
    actions.push({
      label: 'View',
      icon: IconExternalLink,
      disabled: !isBenchRunning,
      onClick: async () => {
        await ipc.openSiteExternal(site.id);
      },
    });
  }

  const isBusy = isResourceBusy(site.id) || Boolean(getPendingSiteAction(site.id));

  actions.push({
    label: 'View Progress',
    icon: IconActivity,
    hidden: !isBusy,
    onClick: () => onStatusClick(site.id),
  });

  actions.push({
    label: 'Open Folder',
    icon: IconFolderOpen,
    onClick: () => openFolder(site.id),
  });

  actions.push({
    label: 'Apps',
    icon: IconPackage,
    disabled: !isBenchRunning || updating.value || isBusy || site.status !== 'ready',
    onClick: () => onShowSiteApps(site),
  });

  actions.push({
    label: 'Delete',
    icon: IconTrash2,
    theme: 'red' as const,
    disabled: !isBenchRunning || updating.value || deleting.value || isResourceBusy(site.id),
    onClick: () => confirmDeleteSite(site.id, site.name),
  });

  return actions.filter((action) => !action.hidden);
};

const showCreateSiteModal = ref(false);
const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));
const siteFilters = reactive({
  benchId: '',
  status: '',
  search: '',
});
const benchFilterSelection = computed({
  get: () => siteFilters.benchId || SELECT_ALL,
  set: (value: string) => {
    siteFilters.benchId = value === SELECT_ALL ? '' : value;
  },
});
const statusFilterSelection = computed({
  get: () => siteFilters.status || SELECT_ALL,
  set: (value: string) => {
    siteFilters.status = value === SELECT_ALL ? '' : value;
  },
});
const benchFilterOptions = computed(() => [
  { label: 'All benches', value: SELECT_ALL },
  ...allBenches.value.map((bench) => ({ label: bench.name, value: bench.id })),
]);
const statusFilterOptions = [
  { label: 'All statuses', value: SELECT_ALL },
  { label: 'Ready', value: 'ready' },
  { label: 'In Progress', value: 'queued' },
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
];
const filteredSites = computed(() => filterSites(sites.value, siteFilters));
const clearSiteFilters = (): void => {
  siteFilters.benchId = '';
  siteFilters.status = '';
  siteFilters.search = '';
};
const siteSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Go to Benches', to: '/benches' },
  { label: 'Review runtime', to: '/diagnostics' },
]);

const getBenchName = (id: string) => {
  const bench = allBenches.value.find((b) => b.id === id);
  return bench ? bench.name : id;
};

const selectedSiteForApps = computed(() => {
  if (!selectedSiteForAppsId.value) return null;
  return sites.value.find((site) => site.id === selectedSiteForAppsId.value) ?? null;
});

const selectedBenchForSiteApps = computed(() => {
  if (!selectedSiteForApps.value) return null;
  return allBenches.value.find((bench) => bench.id === selectedSiteForApps.value?.benchId) ?? null;
});

const benchInstalledAppRows = computed(() => {
  const apps = selectedBenchForSiteApps.value?.apps ?? [];
  return [...apps].sort((left, right) => left.localeCompare(right));
});

const siteActivatedAppSet = computed(() => new Set(selectedSiteForApps.value?.apps ?? []));

const showBenchAppsDialog = ref(false);
const selectedBenchForParentAppsId = ref<string | null>(null);
const removeBenchAppConfirmOpen = ref(false);
const pendingRemoveBenchAppId = ref<string | null>(null);
const pendingRemoveBenchAppName = ref('');

const selectedBenchForParentApps = computed(() => {
  if (!selectedBenchForParentAppsId.value) return null;
  return allBenches.value.find((bench) => bench.id === selectedBenchForParentAppsId.value) ?? null;
});

const parentBenchAppsWarningMessage = computed(() => {
  const bench = selectedBenchForParentApps.value;
  if (!bench) return null;
  if (bench.status !== 'running') return 'Start the bench before managing apps.';
  if (isBenchResourceBusy(bench.id)) return 'App orchestration is currently in progress. Please wait.';
  return null;
});

const canMutateParentBenchApps = computed(() => parentBenchAppsWarningMessage.value === null);

const normalizeSelection = (selectedIds: readonly string[]): string[] =>
  Array.from(new Set(selectedIds.map((id) => id.trim()).filter(Boolean)));

const queueParentBenchAppsUpdate = async (bench: BenchListItem, nextApps: readonly string[]) => {
  const normalizedNextApps = normalizeSelection(nextApps);
  const currentApps = normalizeSelection(bench.apps);
  const sameApps = normalizedNextApps.length === currentApps.length && normalizedNextApps.every((appId, index) => appId === currentApps[index]);
  if (sameApps) {
    return;
  }

  await updateBench(bench.id, { apps: normalizedNextApps });
  await refreshBenches(true);
};

const closeBenchAppsDialog = () => {
  showBenchAppsDialog.value = false;
  selectedBenchForParentAppsId.value = null;
  removeBenchAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;
  pendingRemoveBenchAppName.value = '';
};

const onManageParentBenchApps = () => {
  const bench = selectedBenchForSiteApps.value;
  if (!bench) {
    toast.error('Unable to find the parent bench for this site.');
    return;
  }

  closeSiteAppsDialog();
  selectedBenchForParentAppsId.value = bench.id;
  showBenchAppsDialog.value = true;
};

const onAddParentBenchApp = async (appId: string) => {
  const bench = selectedBenchForParentApps.value;
  if (!bench || !canMutateParentBenchApps.value) {
    return;
  }

  const nextApps = normalizeSelection([...bench.apps, appId]);
  pendingRemoveBenchAppId.value = appId;
  toast.info(`Getting app ${appId} for bench ${bench.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantBenchTaskId(bench.id); },
    },
  });
  await queueParentBenchAppsUpdate(bench, nextApps);
  closeBenchAppsDialog();
};

const onRequestRemoveParentBenchApp = (appId: string) => {
  const bench = selectedBenchForParentApps.value;
  if (!bench || !canMutateParentBenchApps.value) {
    return;
  }

  const appInfo = getAppInfo(appId);
  pendingRemoveBenchAppId.value = appId;
  pendingRemoveBenchAppName.value = appInfo.name;
  removeBenchAppConfirmOpen.value = true;
};

const onCancelRemoveParentBenchApp = () => {
  removeBenchAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;
  pendingRemoveBenchAppName.value = '';
};

const removeBenchAppConfirmMessage = computed(() => {
  const bench = selectedBenchForParentApps.value;
  if (!bench) {
    return 'Remove this app from the bench?';
  }

  return `Remove ${pendingRemoveBenchAppName.value} from bench "${bench.name}"? This will update the bench app list and remove the app from the bench.`;
});

const onConfirmRemoveParentBenchApp = async () => {
  const bench = selectedBenchForParentApps.value;
  const appId = pendingRemoveBenchAppId.value;
  if (!bench || !appId || !canMutateParentBenchApps.value) {
    onCancelRemoveParentBenchApp();
    return;
  }

  removeBenchAppConfirmOpen.value = false;
  const nextApps = bench.apps.filter((existingAppId) => existingAppId !== appId);
  toast.info(`Removing app from bench ${bench.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantBenchTaskId(bench.id); },
    },
  });
  await queueParentBenchAppsUpdate(bench, nextApps);
  closeBenchAppsDialog();
};

const siteAppsWarningMessage = computed(() => {
  const site = selectedSiteForApps.value;
  if (!site) return null;
  
  const siteReady = site.status === 'ready';
  if (!siteReady) return 'Wait for site to be ready before managing apps.';
  
  if (isResourceBusy(site.id)) return 'Site app management is currently in progress. Please wait.';
  
  const bench = allBenches.value.find((b) => b.id === site.benchId);
  const isBenchReady = bench && (bench.status === 'running' || bench.status === 'success');
  if (!isBenchReady) return 'Start the bench before managing site apps.';
  
  const isBenchBusy = tasks.value.some(t => t.resource === 'bench' && t.resourceId === site.benchId && (t.status === 'pending' || t.status === 'running'));
  if (isBenchBusy) return 'Wait for bench app management to finish before managing site apps.';
  
  return null;
});

const canActivateSelectedSiteApps = computed(() => siteAppsWarningMessage.value === null);

const appsToInstall = ref<string[]>([]);
const { getAppInfo } = useAppCatalog();

const removeSiteAppConfirmOpen = ref(false);
const pendingRemoveSiteAppId = ref<string | null>(null);
const pendingRemoveSiteAppName = ref('');

const closeSiteAppsDialog = () => {
  showSiteAppsDialog.value = false;
  selectedSiteForAppsId.value = null;
  activatingSiteAppId.value = null;
  appsToInstall.value = [];
  removeSiteAppConfirmOpen.value = false;
  pendingRemoveSiteAppId.value = null;
  pendingRemoveSiteAppName.value = '';
};

const onShowSiteApps = (site: SiteListItem) => {
  selectedSiteForAppsId.value = site.id;
  showSiteAppsDialog.value = true;
};

const onActivateSiteApp = async (appId: string) => {
  const site = selectedSiteForApps.value;
  if (!site) return;

  if (site.status !== 'ready') {
    toast.error('Wait for site to be ready before installing apps.');
    return;
  }

  const bench = allBenches.value.find((b) => b.id === site.benchId);
  if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
    toast.error('Bench must be running before managing site apps.');
    return;
  }

  const benchApps = selectedBenchForSiteApps.value?.apps ?? [];
  if (!benchApps.includes(appId)) {
    toast.error(`App ${appId} is not installed on this bench.`);
    return;
  }

  const existingApps = site.apps ?? [];
  if (existingApps.includes(appId)) {
    return;
  }

  activatingSiteAppId.value = appId;
  const nextApps = Array.from(new Set([...existingApps, appId]));
  toast.info(`Installing app ${appId} on ${site.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(site.id); },
    },
  });

  try {
    await update(site.id, { apps: nextApps });
    closeSiteAppsDialog();
  } finally {
    activatingSiteAppId.value = null;
  }
};

const onRequestDeactivateSiteApp = (appId: string) => {
  const site = selectedSiteForApps.value;
  if (!site) return;

  const appInfo = getAppInfo(appId);
  pendingRemoveSiteAppId.value = appId;
  pendingRemoveSiteAppName.value = appInfo.name;
  removeSiteAppConfirmOpen.value = true;
};

const onCancelDeactivateSiteApp = () => {
  removeSiteAppConfirmOpen.value = false;
  pendingRemoveSiteAppId.value = null;
  pendingRemoveSiteAppName.value = '';
};

const onConfirmDeactivateSiteApp = async () => {
  const appId = pendingRemoveSiteAppId.value;
  if (!appId) {
    onCancelDeactivateSiteApp();
    return;
  }

  removeSiteAppConfirmOpen.value = false;
  pendingRemoveSiteAppId.value = null;

  await onDeactivateSiteApp(appId);
};

const onDeactivateSiteApp = async (appId: string) => {
  const site = selectedSiteForApps.value;
  if (!site) return;

  if (site.status !== 'ready') {
    toast.error('Wait for site to be ready before uninstalling apps.');
    return;
  }

  const bench = allBenches.value.find((b) => b.id === site.benchId);
  if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
    toast.error('Bench must be running before managing site apps.');
    return;
  }

  const existingApps = site.apps ?? [];
  if (!existingApps.includes(appId)) {
    return;
  }

  activatingSiteAppId.value = appId;
  const nextApps = existingApps.filter((x) => x !== appId);
  toast.info(`Uninstalling app ${appId} from ${site.name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(site.id); },
    },
  });

  try {
    await update(site.id, { apps: nextApps });
    closeSiteAppsDialog();
  } finally {
    activatingSiteAppId.value = null;
    pendingRemoveSiteAppName.value = '';
  }
};

const confirmDeleteSiteOpen = ref(false);
const deleteSiteId = ref<string | null>(null);
const deleteSiteName = ref('');

const confirmDeleteSite = (id: string, name: string) => {
  deleteSiteId.value = id;
  deleteSiteName.value = name;
  confirmDeleteSiteOpen.value = true;
};

const cancelDeleteSite = () => {
  confirmDeleteSiteOpen.value = false;
  deleteSiteId.value = null;
  deleteSiteName.value = '';
};

const onConfirmDeleteSite = async (): Promise<void> => {
  const id = deleteSiteId.value;
  const name = deleteSiteName.value;
  if (!id) {
    return;
  }
  confirmDeleteSiteOpen.value = false;
  toast.info(`Deleting site ${name}`, {
    action: {
      label: 'View progress',
      onClick: () => { selectedTaskId.value = getLatestRelevantTaskId(id); },
    },
  });
  await remove(id);
  cancelDeleteSite();
};

onMounted(() => {

  if (route.query.benchId && typeof route.query.benchId === 'string') {
    siteFilters.benchId = route.query.benchId;
  }
});

watch([() => loading.value, () => creatableBenches.value.length, () => sites.value.length], () => {
  const actions: Array<{
    id: string;
    label: string;
    variant?: 'primary' | 'subtle';
    disabled?: boolean;
    icon?: Component;
    onClick: () => void;
  }> = [];
  if (creatableBenches.value.length > 0 && sites.value.length > 0) {
    actions.push({
      id: 'sites-create',
      label: 'Create',
      variant: 'primary',
      disabled: loading.value,
      icon: IconPlus,
      onClick: () => {
        showCreateSiteModal.value = true;
      },
    });
  }
  setPageHeaderActions(actions);
}, { immediate: true });
</script>
