<template>
  <section class="sites-view">
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
    <Dialog
      v-model="showCreateSiteModal"
      :options="{ title: 'New site', size: '3xl' }"
      @close="onCloseSiteWizard"
    >
      <template #body-content>
        <div class="site-wizard-dialog">
          <div class="wizard-header">
            <span :class="['wizard-header__item', wizardStep === 1 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
              Bench
            </span>
            <IconChevronRight class="wizard-header__icon" />
            <span :class="['wizard-header__item', wizardStep === 2 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
              Details
            </span>
            <IconChevronRight class="wizard-header__icon" />
            <span :class="['wizard-header__item', wizardStep === 3 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
              Apps
            </span>
            <IconChevronRight class="wizard-header__icon" />
            <span :class="['wizard-header__item', wizardStep === 4 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
              Confirm
            </span>
          </div>

          <form
            class="form-body"
            @submit.prevent="onCreateSite"
          >
            <p
              v-if="wizardErrors.length > 0"
              class="mb-4 text-sm text-ink-red-3"
            >
              {{ wizardErrors.join(' ') }}
            </p>

            <div
              v-if="wizardStep === 1"
              class="form-grid"
            >
              <label class="form-field">
                <span class="mb-1 text-xs font-medium text-ink-gray-6">Select bench</span>
                <Select
                  v-model="createBenchSelection"
                  :disabled="benchLoading"
                  :options="createBenchOptions"
                  variant="outline"
                />
              </label>
            </div>

            <div
              v-if="wizardStep === 2"
              class="form-grid"
            >
              <label class="form-field">
                <FormLabel label="Site name" />
                <TextInput
                  v-model="createForm.name"
                  type="text"
                  required
                  placeholder="my-site"
                  variant="outline"
                >
                  <template #suffix>
                    <span class="text-p-sm text-ink-gray-6">.localhost</span>
                  </template>
                </TextInput>
              </label>
              <div class="flex items-center gap-2">
                <Switch
                  v-model="createForm.force"
                  label="Force create"
                />
              </div>
            </div>

            <div
              v-if="wizardStep === 3"
              class="form-grid"
            >
              <label class="form-field">
                <FormLabel label="Apps" />
                <AppPicker
                  v-model="createForm.appsSelected"
                  class="form-field__control"
                  :disabled="creating || loading"
                  :frappe-version="selectedBench?.frappeVersion"
                  :allowed-app-ids="selectedBenchAppIds"
                  :disabled-app-ids="defaultInstalledSiteApps"
                />
              </label>
            </div>

            <div
              v-if="wizardStep === 4"
              class="p-4 rounded wizard-summary bg-surface-gray-2"
            >
              <div class="flex justify-between mb-2">
                <span>Bench</span><strong>{{ selectedBench?.name ?? createForm.benchId }}</strong>
              </div>
              <div class="flex justify-between mb-2">
                <span>Site</span><strong>{{ toSiteDomain(createForm.name) }}</strong>
              </div>
              <div
                v-if="createForm.force"
                class="flex justify-between mb-2"
              >
                <span>Force</span><strong>Yes</strong>
              </div>
              <div class="flex justify-between">
                <span>Apps</span><strong>{{ selectedApps.length > 0 ? selectedApps.join(', ') : 'None' }}</strong>
              </div>
            </div>
          </form>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button
            v-if="wizardStep > 1"
            size="md"
            variant="subtle"
            @click="onPreviousStep"
          >
            Back
          </Button>
          <Button
            v-if="wizardStep < 4"
            size="md"
            variant="solid"
            @click="onNextStep"
          >
            Next
          </Button>
          <Button
            v-if="wizardStep === 4"
            size="md"
            variant="solid"
            :loading="creating"
            :disabled="loading"
            @click="onCreateSite"
          >
            {{ creating ? 'Creating…' : 'Create site' }}
          </Button>
        </div>
      </template>
    </Dialog>

    <StatePanel
      v-if="!error && loading && sites.length === 0"
      kind="loading"
      title="Loading sites"
      body="Fetching sites and active status metadata."
    />

    <section
      v-if="!error && (!loading || sites.length > 0) && sites.length === 0"
      class="bench-empty-state"
    >
      <h2 class="bench-empty-state__title">
        No sites yet
      </h2>
      <p class="bench-empty-state__description">
        Create your first site to manage runtime status, inspect logs, and access dashboards.
      </p>
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
    </section>

    <!-- Filters -->
    <div
      v-if="!error && sites.length > 0"
      class="site-filters"
    >
      <div class="site-filters__left">
        <Select
          v-model="benchFilterSelection"
          class="site-filters__select"
          :options="benchFilterOptions"
          variant="outline"
        />
        <Select
          v-model="statusFilterSelection"
          class="site-filters__select"
          :options="statusFilterOptions"
          variant="outline"
        />
      </div>
      <div class="site-filters__right">
        <div class="site-filters__search">
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
            <div class="font-medium text-ink-gray-9">
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
              class="cursor-pointer status-badge"
              @click.stop="onStatusClick(row.id, 'site')"
            >
              {{ formatStatusLabel(row) }}
              <span
                v-if="isResourceBusy(row.id, 'site')"
                class="status-badge__spinner"
              />
            </Badge>
          </div>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div
            class="flex justify-end"
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
    </ListView>

    <ConfirmationDialog
      :open="deleteConfirmOpen"
      title="Delete site"
      :message="`Delete site ${pendingDeleteSiteName}? Type the site name to confirm.`"
      confirm-label="Delete site"
      :confirmation-phrase="pendingDeleteSiteName || null"
      :typed-value="deleteTypedValue"
      @update:typed-value="val => deleteTypedValue = val"
      @cancel="onCancelDeleteSite"
      @confirm="onConfirmDeleteSite"
    />

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
        <p class="text-sm text-ink-gray-7">{{ createFailureMessage }}</p>
      </template>
      <template #actions>
        <div class="dialog-actions">
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
      v-model="showSiteAppsDialog"
      :options="{ title: `Manage Apps in ${selectedSiteForApps?.name || 'Site'}`, size: '3xl' }"
      @close="closeSiteAppsDialog"
    >
      <template #body-content>
        <div class="flex flex-col gap-4">
          <Tabs
            v-model="selectedSiteAppsTabIndex"
            as="div"
            :tabs="siteAppsTabs"
          >
            <template #tab-panel="{ tab }">
              <div
                v-if="tab.label === 'Bench apps'"
                class="flex flex-col gap-2 pt-4"
              >
                <div
                  v-if="benchInstalledAppRows.length === 0"
                  class="py-8 text-center text-ink-gray-5"
                >
                  No apps found on this bench.
                </div>
                <div
                  v-else
                  class="max-h-[48vh] overflow-y-auto rounded-md border border-outline-gray-1"
                >
                  <div
                    v-for="appId in benchInstalledAppRows"
                    :key="`bench-app-${appId}`"
                    class="flex items-center justify-between px-4 py-3 border-b border-outline-gray-1 last:border-b-0"
                  >
                    <span class="font-medium text-ink-gray-8">{{ appId }}</span>
                    <Badge
                      variant="subtle"
                      :theme="siteActivatedAppSet.has(appId) ? 'green' : 'gray'"
                    >
                      {{ siteActivatedAppSet.has(appId) ? 'Activated on site' : 'Not activated' }}
                    </Badge>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="flex flex-col gap-2 pt-4"
              >
                <div
                  v-if="benchInstalledAppRows.length === 0"
                  class="py-8 text-center text-ink-gray-5"
                >
                  No bench apps available to activate.
                </div>
                <div
                  v-else
                  class="max-h-[48vh] overflow-y-auto rounded-md border border-outline-gray-1"
                >
                  <div
                    v-for="appId in benchInstalledAppRows"
                    :key="`activate-app-${appId}`"
                    class="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-gray-1 last:border-b-0"
                  >
                    <span class="font-medium text-ink-gray-8">{{ appId }}</span>
                    <Button
                      size="sm"
                      :variant="siteActivatedAppSet.has(appId) ? 'subtle' : 'solid'"
                      :loading="activatingSiteAppId === appId"
                      :disabled="siteActivatedAppSet.has(appId) || activatingSiteAppId !== null || updating || !canActivateSelectedSiteApps"
                      @click="siteActivatedAppSet.has(appId) ? undefined : onActivateSiteApp(appId)"
                    >
                      {{ siteActivatedAppSet.has(appId) ? 'Active' : 'Activate' }}
                    </Button>
                  </div>
                </div>
              </div>
            </template>
          </Tabs>

          <p
            v-if="selectedSiteForApps && selectedSiteForApps.status !== 'running'"
            class="text-sm text-ink-amber-4"
          >
            Start the site before activating apps.
          </p>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button
            size="md"
            variant="solid"
            @click="closeSiteAppsDialog"
          >
            Close
          </Button>
        </div>
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import { Badge, Button, Dialog, Dropdown, FormLabel, ListView, Select, Switch, Tabs, TextInput, toast } from 'frappe-ui';
import IconPlus from '~icons/lucide/plus';
import IconExternalLink from '~icons/lucide/external-link';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconPlay from '~icons/lucide/play';
import IconSearch from '~icons/lucide/search';
import IconSquare from '~icons/lucide/square';
import IconTrash from '~icons/lucide/trash-2';
import IconPackage from '~icons/lucide/package';
import type { FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import AppPicker from '../components/AppPicker.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import FirstRunGuide from '../components/FirstRunGuide.vue';
import StatePanel from '../components/StatePanel.vue';
import TaskLogModal from '../components/TaskLogModal.vue';
import { useIpc } from '../composables/useIpc';
import { useSites } from '../composables/useSites';
import { useProgressCenter } from '../composables/useProgressCenter';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import {
  buildSiteCreatePayload,
  getSiteWizardStepErrors,
  toSiteDomain,
  suggestSitePath,
  type SiteWizardStep,
} from '../site-wizard';
import { filterSites } from '../site-filters';
import { canStartSiteFromUi, canStopSiteFromUi } from '../site-action-guards';
import { acknowledgeHistoricalCompletedSiteAppTasks, isCompletedSiteAppUpdateTask } from '../site-app-task-results';
import type { BenchListItem, SiteListItem } from '../../shared/ipc';
import { humanizeCreateFailure } from '../../shared/runtime-errors';

const ipc = useIpc();
const route = useRoute();

const {
  sites,
  loading,
  creating,
  updating,
  deleting,
  error,
  create,
  update,
  remove,
  refresh,
} = useSites();

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

onBeforeUnmount(() => {
  clearPageHeaderActions();
});

const { tasks } = useProgressCenter();
const selectedTaskId = ref<string | null>(null);
const showCreateFailureDialog = ref(false);
const createFailureTitle = ref('Site Creation Failed');
const createFailureMessage = ref('Site creation failed. Check Progress for details.');
const acknowledgedCreateFailures = ref(new Set<string>());
const acknowledgedSiteAppTaskResults = ref(new Set<string>());
const initializedSiteAppTaskAcks = ref(false);
const showSiteAppsDialog = ref(false);
const selectedSiteForAppsId = ref<string | null>(null);
const selectedSiteAppsTab = ref<'bench' | 'activate'>('activate');
const siteAppsTabs = [
  { label: 'Bench apps' },
  { label: 'Activate on site' },
];
const selectedSiteAppsTabIndex = computed({
  get: () => (selectedSiteAppsTab.value === 'bench' ? 0 : 1),
  set: (value: string | number) => {
    const normalizedValue = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    selectedSiteAppsTab.value = normalizedValue === 0 ? 'bench' : 'activate';
  },
});
const activatingSiteAppId = ref<string | null>(null);

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});

const pendingSiteActions = ref<Record<string, 'starting' | 'stopping'>>({});

const getPendingSiteAction = (siteId: string) => pendingSiteActions.value[siteId];

const setPendingSiteAction = (siteId: string, action: 'starting' | 'stopping') => {
  pendingSiteActions.value = {
    ...pendingSiteActions.value,
    [siteId]: action,
  };
};

const clearPendingSiteAction = (siteId: string) => {
  if (!pendingSiteActions.value[siteId]) {
    return;
  }

  const next = { ...pendingSiteActions.value };
  delete next[siteId];
  pendingSiteActions.value = next;
};

watch(
  sites,
  (nextSites) => {
    for (const site of nextSites) {
      if (site.status !== 'queued') {
        clearPendingSiteAction(site.id);
      }
    }
  },
  { deep: true }
);

const SELECT_NONE = '__none__';
const SELECT_ALL = '__all__';

const formatStatusLabel = (row: SiteListItem) => {
  const pendingAction = getPendingSiteAction(row.id);
  if (pendingAction === 'starting') return 'Starting';
  if (pendingAction === 'stopping') return 'Stopping';

  const failedAppTask = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'site' && t.status === 'failure' && t.taskName.toLowerCase().includes('update site apps')
  );

  if (failedAppTask) {
    const failureMessage = String(failedAppTask.message ?? '').toLowerCase();
    if (failureMessage.includes('cancelled')) return 'Install cancelled';
    if (failureMessage.includes('timed out')) return 'Install timed out';
    return 'Install failed';
  }

  const task = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'site' && (t.status === 'running' || t.status === 'queued')
  );

  if (task) {
    const name = String(task.taskName ?? '').toLowerCase();
    if (name.includes('create site')) return 'Creating';
    if (name.includes('update site apps')) {
      const stepName = String(task.stepName ?? '').toLowerCase();
      if (stepName.includes('install')) return 'Installing';
      if (stepName.includes('migrate')) return 'Migrating';
      return 'Installing';
    }
    if (name.includes('stop site')) return 'Stopping';
    if (name.includes('start site')) return 'Starting';
    if (name.includes('delete site')) return 'Deleting';
    return typeof task.stepName === 'string' && task.stepName.length > 0 ? task.stepName : 'Processing';
  }

  if (row.status === 'running') return 'Running';
  if (row.status === 'stopped') return 'Stopped';
  if (row.status === 'queued') return 'In Progress';
  if (row.status === 'failure') return 'Failed';
  return typeof row.status === 'string' && row.status.length > 0 ? row.status : 'Unknown';
};

const isResourceBusy = (id: string, resource: 'bench' | 'site') => {
  return (tasks.value || []).some(
    (t) => t.resourceId === id && t.resource === resource && (t.status === 'running' || t.status === 'queued')
  );
};

const onStatusClick = (resourceId: string, resource: 'bench' | 'site') => {
  const isSiteAppsTask = (taskName: string) => taskName.toLowerCase().includes('update site apps');

  const activeSiteAppsTask = resource === 'site'
    ? tasks.value.find(
      (t) => t.resourceId === resourceId && t.resource === resource && isSiteAppsTask(t.taskName) && (t.status === 'running' || t.status === 'queued')
    )
    : null;

  if (activeSiteAppsTask) {
    selectedTaskId.value = activeSiteAppsTask.taskId;
    return;
  }

  const activeTask = tasks.value.find(
    (t) => t.resourceId === resourceId && t.resource === resource && (t.status === 'running' || t.status === 'queued')
  );

  if (activeTask) {
    selectedTaskId.value = activeTask.taskId;
    return;
  }

  const completedSiteAppsTask = resource === 'site'
    ? tasks.value.find(
      (t) => t.resourceId === resourceId && t.resource === resource && isSiteAppsTask(t.taskName) && (t.status === 'success' || t.status === 'failure')
    )
    : null;

  if (completedSiteAppsTask) {
    selectedTaskId.value = completedSiteAppsTask.taskId;
    return;
  }

  const completedTask = tasks.value.find(
    (t) => t.resourceId === resourceId && t.resource === resource && (t.status === 'success' || t.status === 'failure')
  );

  selectedTaskId.value = completedTask?.taskId ?? null;
};

watch(
  tasks,
  (items) => {
    if (!initializedSiteAppTaskAcks.value) {
      acknowledgeHistoricalCompletedSiteAppTasks(items, acknowledgedSiteAppTaskResults.value);
      initializedSiteAppTaskAcks.value = true;
    }

    for (const task of items) {
      if (
        task.status === 'failure' &&
        task.resource === 'site' &&
        task.taskName.toLowerCase().includes('create site') &&
        !acknowledgedCreateFailures.value.has(task.taskId)
      ) {
        acknowledgedCreateFailures.value.add(task.taskId);
        createFailureTitle.value = 'Site Creation Failed';
        createFailureMessage.value = humanizeCreateFailure('site', task.message);
        showCreateFailureDialog.value = true;
      }

      if (
        isCompletedSiteAppUpdateTask(task) &&
        !acknowledgedSiteAppTaskResults.value.has(task.taskId)
      ) {
        acknowledgedSiteAppTaskResults.value.add(task.taskId);
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

const getStatusTheme = (row: SiteListItem) => {
  if (getPendingSiteAction(row.id)) return 'blue';
  if (isResourceBusy(row.id, 'site')) return 'blue';
  const failedAppTask = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'site' && t.status === 'failure' && t.taskName.toLowerCase().includes('update site apps')
  );
  if (failedAppTask) return String(failedAppTask.message ?? '').toLowerCase().includes('cancelled') ? 'gray' : 'red';
  const status = row.status;
  if (status === 'running') return 'green';
  if (status === 'stopped') return 'gray';
  if (status === 'queued') return 'blue';
  if (status === 'failure') return 'red';
  return 'gray';
};

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

  const isBusy = isResourceBusy(site.id, 'site') || Boolean(getPendingSiteAction(site.id));

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
    disabled: updating.value || deleting.value || site.status === 'running' || isResourceBusy(site.id, 'site'),
    onClick: () => onDeleteSite(site.id, site.name),
  });

  return actions;
};

const createForm = reactive({
  name: '',
  benchId: '',
  path: '',
  appsText: '',
  appsSelected: [] as string[],
  force: false,
});

const showCreateSiteModal = ref(false);
const wizardStep = ref<SiteWizardStep>(1);
const wizardErrors = ref<string[]>([]);
const allBenches = ref<BenchListItem[]>([]);
const benchLoading = ref(false);
const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));
const createBenchSelection = computed({
  get: () => createForm.benchId || SELECT_NONE,
  set: (value: string) => {
    createForm.benchId = value === SELECT_NONE ? '' : value;
  },
});
const createBenchOptions = computed(() => [
  { label: 'Choose a bench…', value: SELECT_NONE },
  ...creatableBenches.value.map((bench) => ({
    label: `${bench.name} (${bench.status})`,
    value: bench.id,
  })),
]);

const selectedBench = computed(() => allBenches.value.find((bench) => bench.id === createForm.benchId) ?? null);
const selectedBenchAppIds = computed(() => {
  const apps = selectedBench.value?.apps ?? [];
  return [...new Set(apps.map((app) => app.trim()).filter(Boolean))];
});
const defaultInstalledSiteApps = ['frappe'];
const selectedApps = computed(() => createForm.appsSelected);
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

const loadBenchOptions = async () => {
  benchLoading.value = true;
  try {
    const benches = await ipc.listBenches();
    allBenches.value = benches;
  } catch (err) {
    wizardErrors.value = [String(err)];
  } finally {
    benchLoading.value = false;
  }
};

const applyPathDefault = () => {
  if (!selectedBench.value) return;
  createForm.path = suggestSitePath(selectedBench.value.path, createForm.name);
};

watch(() => createForm.benchId, applyPathDefault);
watch(() => createForm.name, applyPathDefault);
watch(selectedBenchAppIds, (allowedApps) => {
  if (allowedApps.length === 0) {
    createForm.appsSelected = [];
    return;
  }

  const allowed = new Set(allowedApps);
  createForm.appsSelected = createForm.appsSelected.filter((appId) => allowed.has(appId));
});

const onNextStep = async () => {
  const errors = getSiteWizardStepErrors(wizardStep.value, createForm);
  if (wizardStep.value === 2) {
    const siteDomain = toSiteDomain(createForm.name);
    const duplicateInDb = sites.value.find(s => s.name === siteDomain);
    if (duplicateInDb && !createForm.force) {
      errors.push(`A site named "${siteDomain}" already exists in the database. Enable "Force create" to overwrite.`);
    }
    if (!createForm.force) {
      const exists = await ipc.pathExists(createForm.path);
      if (exists) {
        errors.push('Site already exists at this path. Enable "Force create" to overwrite.');
      }
    }
  }
  wizardErrors.value = errors;
  if (errors.length > 0) return;
  if (wizardStep.value < 4) wizardStep.value = (wizardStep.value + 1) as SiteWizardStep;
};

const onPreviousStep = () => {
  wizardErrors.value = [];
  if (wizardStep.value > 1) wizardStep.value = (wizardStep.value - 1) as SiteWizardStep;
};

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

const closeSiteAppsDialog = () => {
  showSiteAppsDialog.value = false;
  selectedSiteForAppsId.value = null;
  selectedSiteAppsTab.value = 'activate';
  activatingSiteAppId.value = null;
};

const onShowSiteApps = (site: SiteListItem) => {
  selectedSiteForAppsId.value = site.id;
  selectedSiteAppsTab.value = 'activate';
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

const onCreateSite = async () => {
  const result = buildSiteCreatePayload(createForm);
  wizardErrors.value = result.errors;
  if (!result.payload) return;
  toast.success(`Creating site ${result.payload.name}...`);
  await create(result.payload);
  onCloseSiteWizard();
  await loadBenchOptions();
};

const onCloseSiteWizard = () => {
  showCreateSiteModal.value = false;
  wizardStep.value = 1;
  wizardErrors.value = [];
  createForm.name = '';
  createForm.benchId = '';
  createForm.path = '';
  createForm.appsText = '';
  createForm.appsSelected = [];
  createForm.force = false;
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

const deleteConfirmOpen = ref(false);
const pendingDeleteSiteId = ref<string | null>(null);
const pendingDeleteSiteName = ref('');
const deleteTypedValue = ref('');

const onDeleteSite = async (id: string, name: string) => {
  pendingDeleteSiteId.value = id;
  pendingDeleteSiteName.value = name;
  deleteTypedValue.value = '';
  deleteConfirmOpen.value = true;
};

const onCancelDeleteSite = (): void => {
  deleteConfirmOpen.value = false;
  pendingDeleteSiteId.value = null;
  pendingDeleteSiteName.value = '';
  deleteTypedValue.value = '';
};

const onConfirmDeleteSite = async (): Promise<void> => {
  const id = pendingDeleteSiteId.value;
  const name = pendingDeleteSiteName.value;
  if (!id) {
    onCancelDeleteSite();
    return;
  }
  deleteConfirmOpen.value = false;
  toast.success(`Deleting site ${name}...`);
  await remove(id);
  onCancelDeleteSite();
};


onMounted(() => {
  void loadBenchOptions();
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

<style scoped>
.sites-view {
  display: flex;
  flex-direction: column;
}

.bench-empty-state {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: white;
  text-align: center;
}

.bench-empty-state__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.bench-empty-state__description {
  margin: 8px 0 24px;
  font-size: 14px;
  color: var(--text-muted);
}

.site-wizard-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wizard-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0 8px;
}

.wizard-header__item {
  font-size: 0.95rem;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.wizard-header__item--active {
  color: var(--text-primary);
  font-weight: 500;
}

.wizard-header__item--inactive {
  color: var(--text-muted);
}

.wizard-header__icon {
  width: 15px;
  height: 15px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-grid {
  display: grid;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wizard-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wizard-summary > div {
  font-size: 13px;
}

.wizard-summary strong {
  font-weight: 600;
}

.site-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.site-filters__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.site-filters__select {
  flex: 0 0 auto;
  width: auto;
}

.site-filters__right {
  margin-left: auto;
  width: 200px;
  max-width: 200px;
  min-width: 200px;
}

.site-filters__search {
  width: 100%;
}

.site-filters__search :deep(.relative) {
  width: 100%;
}

@media (max-width: 980px) {
  .site-filters {
    flex-wrap: wrap;
    align-items: stretch;
  }

  .site-filters__left {
    width: 100%;
    flex-wrap: wrap;
  }

  .site-filters__right {
    margin-left: 0;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-badge__spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 9999px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
