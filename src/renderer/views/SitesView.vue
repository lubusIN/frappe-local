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
      @created="refresh"
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
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'name'">
          <div class="flex items-center h-full min-w-0">
            <div class="text-sm font-medium truncate text-ink-gray-9">
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
            class="flex items-center justify-end h-full"
            @click.stop
          >
            <Dropdown :options="getSiteActions(row)">
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
      :can-mutate="canMutateSiteApps"
      :frappe-version="selectedBenchForSiteApps?.frappeVersion"
      :loading-app-id="activatingSiteAppId"
      @close="closeSiteAppsDialog"
      @add-app="onActivateSiteApp"
      @remove-app="onRequestDeactivateSiteApp"
    />

    <ConfirmationDialog
      :open="removeSiteAppConfirmOpen"
      title="Deactivate app"
      :message="`Are you sure you want to deactivate and uninstall &quot;${pendingRemoveSiteAppName}&quot; from site &quot;${selectedSiteForApps?.name}&quot;? This will drop the app's database tables and delete all associated data.`"
      confirm-label="Deactivate"
      @cancel="onCancelDeactivateSiteApp"
      @confirm="onConfirmDeactivateSiteApp"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import { Badge, Button, Dropdown, Select, TextInput, toast } from 'frappe-ui';
import ConfirmationDialog from '../components/dialogs/ConfirmationDialog.vue';
import IconPlus from '~icons/lucide/plus';
import IconExternalLink from '~icons/lucide/external-link';
import IconFolderOpen from '~icons/lucide/folder-open';
import IconActivity from '~icons/lucide/activity';

import IconSearch from '~icons/lucide/search';
import IconTrash from '~icons/lucide/trash-2';
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import type { FirstRunGuideLink } from '../components/FirstRunGuide.vue';



import FirstRunGuide from '../components/FirstRunGuide.vue';
import StatePanel from '../components/ui/StatePanel.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import ResourceListView from '../components/ui/ResourceListView.vue';
import ManageAppsDialog from '../components/dialogs/ManageAppsDialog.vue';
import TaskLogDialog from '../components/dialogs/TaskLogDialog.vue';
import SiteWizardDialog from '../components/dialogs/SiteWizardDialog.vue';
import { useIpc } from '../composables/system/useIpc';
import { useSites } from '../composables/data/useSites';
import { useProgressCenter } from '../composables/system/useProgressCenter';
import { useResourceTaskState } from '../composables/system/useResourceTaskState';
import { usePageHeaderActions } from '../composables/ui/usePageHeaderActions';
import { useAppCatalog } from '../composables/data/useAppCatalog';
import { useBenches } from '../composables/data/useBenches';
import { filterSites } from '../utils/sites/site-filters';
import {
  isCompletedSiteAppUpdateTask,
  isCompletedSiteCreationTask,
} from '../utils/sites/site-app-task-results';
import type { SiteListItem } from '../../shared/core/ipc';

const ipc = useIpc();
const route = useRoute();

const {
  sites,
  loading,
  updating,
  deleting,
  error,
  update,
  remove,
  refresh,
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
            duration: 10,
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
        const siteName = sites.value.find((site) => site.id === task.resourceId)?.name
          ?? task.taskName.replace(/^Update Site Apps\s+/i, '').trim();

        void refresh();

        if (task.status === 'success') {
          toast.success(`Site apps updated for ${siteName}.`);
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

const getSiteActions = (site: SiteListItem) => {
  const actions: Array<{
    label: string;
    icon: Component;
    disabled?: boolean;
    hidden?: boolean;
    theme?: 'gray' | 'red';
    onClick: () => void | Promise<void>;
  }> = [];

  if (site.status === 'running' || site.status === 'stopped') {
    actions.push({
      label: 'View',
      icon: IconExternalLink,
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
    disabled: updating.value || isBusy || (site.status !== 'running' && site.status !== 'stopped'),
    onClick: () => onShowSiteApps(site),
  });

  actions.push({
    label: 'Delete',
    icon: IconTrash,
    theme: 'red' as const,
    disabled: updating.value || deleting.value || isResourceBusy(site.id),
    onClick: () => confirmDeleteSite(site.id, site.name),
  });

  return actions.filter((action) => !action.hidden);
};

const showCreateSiteModal = ref(false);
const { benches: allBenches, loading: benchLoading } = useBenches();
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
  { label: 'Running', value: 'running' },
  { label: 'Stopped', value: 'stopped' },
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

const canMutateSiteApps = computed(() => {
  if (!selectedSiteForApps.value) return false;
  return selectedSiteForApps.value.status === 'running' || selectedSiteForApps.value.status === 'stopped';
});

const canActivateSelectedSiteApps = computed(() => {
  if (!selectedSiteForApps.value) return false;
  const isSiteReady = selectedSiteForApps.value.status === 'running' || selectedSiteForApps.value.status === 'stopped';
  const bench = allBenches.value.find((b) => b.id === selectedSiteForApps.value!.benchId);
  const isBenchReady = bench && (bench.status === 'running' || bench.status === 'success');
  return isSiteReady && isBenchReady && !isResourceBusy(selectedSiteForApps.value.id, 'site');
});

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

  if (site.status !== 'running' && site.status !== 'stopped') {
    toast.error('Wait for site to be ready before activating apps.');
    return;
  }

  const bench = allBenches.value.find((b) => b.id === site.benchId);
  if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
    toast.error('Bench must be running before modifying site apps.');
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
  toast.success(`Activating app ${appId} on ${site.name}...`);

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

  if (site.status !== 'running' && site.status !== 'stopped') {
    toast.error('Wait for site to be ready before deactivating apps.');
    return;
  }

  const bench = allBenches.value.find((b) => b.id === site.benchId);
  if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
    toast.error('Bench must be running before modifying site apps.');
    return;
  }

  const existingApps = site.apps ?? [];
  if (!existingApps.includes(appId)) {
    return;
  }

  activatingSiteAppId.value = appId;
  const nextApps = existingApps.filter((x) => x !== appId);
  toast.success(`Deactivating app ${appId} from ${site.name}...`);

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
  toast.success(`Deleting site ${name}...`);
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
