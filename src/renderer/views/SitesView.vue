<template>
  <section class="flex flex-col">
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
      <div
        v-else
        class="mt-6"
      >
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
      class="flex items-center gap-3 mb-6"
    >
      <div class="flex items-center gap-3">
        <Select
          v-model="benchFilterSelection"
          class="flex-none w-auto"
          :options="benchFilterOptions"
          variant="outline"
        />
        <Select
          v-model="statusFilterSelection"
          class="flex-none w-auto"
          :options="statusFilterOptions"
          variant="outline"
        />
      </div>
      <div class="ml-auto w-[200px]">
        <div class="w-full">
          <TextInput
            v-model="siteFilters.search"
            type="search"
            placeholder="Search..."
            variant="outline"
          >
            <template #prefix>
              <IconSearch class="w-4" />
            </template>
          </TextInput>
        </div>
      </div>
    </div>

    <ListView
      v-if="!error && (!loading || sites.length > 0) && filteredSites.length > 0"
      :columns="siteColumns"
      :rows="filteredSites"
      row-key="id"
      :options="siteListOptions"
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'name'">
          <div class="py-3">
            <div class="font-medium text-md text-ink-gray-9">
              {{ row.name }}
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'benchId'">
          <span class="text-sm text-ink-gray-6">{{ getBenchName(row.benchId) }}</span>
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
            <Dropdown :options="getSiteActions(row).filter((a) => !a.hidden)">
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
    </ListView>

    <ConfirmDialog
      :open="confirmDeleteSiteOpen"
      title="Delete Site"
      :message="`Are you sure you want to delete site &quot;${deleteSiteName}&quot;? This will remove all data and cannot be undone.`"
      confirm-label="Delete"
      confirm-theme="red"
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

    <ConfirmDialog
      :open="removeSiteAppConfirmOpen"
      title="Deactivate app"
      :message="`Are you sure you want to deactivate and uninstall &quot;${pendingRemoveSiteAppName}&quot; from site &quot;${selectedSiteForApps?.name}&quot;? This will drop the app's database tables and delete all associated data.`"
      confirm-label="Deactivate"
      confirm-theme="red"
      @cancel="onCancelDeactivateSiteApp"
      @confirm="onConfirmDeactivateSiteApp"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import { Badge, Button, Dropdown, ListView, Select, TextInput, toast, ConfirmDialog } from 'frappe-ui';
import IconPlus from '~icons/lucide/plus';
import IconExternalLink from '~icons/lucide/external-link';
import IconActivity from '~icons/lucide/activity';

import IconPlay from '~icons/lucide/play';
import IconSearch from '~icons/lucide/search';
import IconSquare from '~icons/lucide/square';
import IconTrash from '~icons/lucide/trash-2';
import IconPackage from '~icons/lucide/package';
import type { FirstRunGuideLink } from '../components/FirstRunGuide.vue';



import FirstRunGuide from '../components/FirstRunGuide.vue';
import StatePanel from '../components/ui/StatePanel.vue';
import EmptyState from '../components/ui/EmptyState.vue';
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
import { canStartSiteFromUi, canStopSiteFromUi } from '../utils/sites/site-action-guards';
import { isCompletedSiteAppUpdateTask } from '../utils/sites/site-app-task-results';
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
  setPendingAction: setPendingSiteAction,
  getPendingAction: getPendingSiteAction,
  clearPendingAction: clearPendingSiteAction,
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
        isCompletedSiteAppUpdateTask(task) &&
        !acknowledgedTasks.has(task.taskId)
      ) {
        acknowledgedTasks.add(task.taskId);
        const siteName = sites.value.find((site) => site.id === task.resourceId)?.name
          ?? task.taskName.replace(/^Update Site Apps\s+/i, '').trim();

        void refresh();

        if (task.status === 'success') {
          toast.success(`Site apps updated for ${siteName}.`);
        } else {
          toast.error(`App activation failed for ${siteName}. Check progress logs.`);
          selectedTaskId.value = task.taskId;
        }
      }
    }
  },
  { deep: true }
);

const SELECT_ALL = '__all__';

const siteColumns = reactive([
  { key: 'name', label: 'Site', width: 'minmax(200px, 2fr)' },
  { key: 'benchId', label: 'Bench', width: '120px' },
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'actions', label: '', width: '60px' },
]);

const siteListOptions = computed(() => ({
  selectable: false,
  showTooltip: true,
  resizeColumn: true,
  rowHeight: '52px',
  emptyState: {
    title: 'No Sites',
    description: 'No matching sites found for current filters.',
  },
}));

const getSiteActions = (site: SiteListItem) => {
  const actions: Array<{
    label: string;
    icon: Component;
    disabled?: boolean;
    hidden?: boolean;
    theme?: 'gray' | 'red';
    onClick: () => void | Promise<void>;
  }> = [];

  if (site.status === 'running') {
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
    label: 'Start',
    icon: IconPlay,
    disabled: updating.value || isBusy || !canStartSite(site.id),
    onClick: () => onSetSiteStatus(site.id, 'running'),
  });

  actions.push({
    label: 'Stop',
    icon: IconSquare,
    disabled: updating.value || site.status === 'stopped' || isBusy || !canStopSite(site.id),
    onClick: () => onSetSiteStatus(site.id, 'stopped'),
  });

  actions.push({
    label: 'Apps',
    icon: IconPackage,
    disabled: updating.value || isBusy || site.status !== 'running',
    onClick: () => onShowSiteApps(site),
  });

  actions.push({
    label: 'Delete',
    icon: IconTrash,
    theme: 'red' as const,
    disabled: updating.value || deleting.value || site.status === 'running' || isResourceBusy(site.id),
    onClick: () => confirmDeleteSite(site.id, site.name),
  });

  return actions;
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

const canActivateSelectedSiteApps = computed(() => {
  if (!selectedSiteForApps.value) return false;
  return selectedSiteForApps.value.status === 'running' && !isResourceBusy(selectedSiteForApps.value.id, 'site');
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

  if (site.status !== 'running') {
    toast.error('Start the site before activating apps.');
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

  if (site.status !== 'running') {
    toast.error('Start the site before deactivating apps.');
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

const onSetSiteStatus = async (id: string, status: 'running' | 'stopped') => {
  const site = sites.value.find(s => s.id === id);
  const name = site ? site.name : '';
  
  if (status === 'running') {
    toast.success(`Starting site ${name}...`);
    setPendingSiteAction(id, 'starting');
  } else {
    toast.success(`Stopping site ${name}...`);
    setPendingSiteAction(id, 'stopping');
  }

  try {
    await update(id, { status });
  } catch {
    clearPendingSiteAction(id);
  }
};

const canStartSite = (siteId: string): boolean => {
  const site = sites.value.find((entry) => entry.id === siteId);
  return site ? canStartSiteFromUi(site, allBenches.value) : false;
};

const canStopSite = (siteId: string): boolean => {
  const site = sites.value.find((entry) => entry.id === siteId);
  return site ? canStopSiteFromUi(site) : false;
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

watch([() => loading.value, () => creatableBenches.value.length], () => {
  const actions: Array<{
    id: string;
    label: string;
    variant?: 'primary' | 'subtle';
    disabled?: boolean;
    icon?: Component;
    onClick: () => void;
  }> = [];
  if (creatableBenches.value.length > 0) {
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
