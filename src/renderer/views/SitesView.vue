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

    <div v-if="successMessage" class="alert alert--success">
      <IconCheckCircle class="alert-icon" />
      {{ successMessage }}
    </div>

    <FirstRunGuide
      v-if="!loading && !benchLoading && allBenches.length === 0"
      title="Create a bench before creating sites"
      body="Sites are attached to benches. Once you have one running bench, this screen becomes the main place to create, control, and export sites."
      :links="siteSetupLinks"
      compact
    />

    <!-- Creation Dialog -->
    <Dialog v-model="showCreateSiteModal" :options="{ title: 'New site', size: '3xl' }">
      <template #body-content>
        <div class="site-wizard-dialog">
          <div class="wizard-header">
            <div class="wizard-steps">
              <span class="wizard-step" :class="{ 'wizard-step--active': wizardStep === 1, 'wizard-step--done': wizardStep > 1 }">1. Bench</span>
              <span class="wizard-step" :class="{ 'wizard-step--active': wizardStep === 2, 'wizard-step--done': wizardStep > 2 }">2. Configure</span>
              <span class="wizard-step" :class="{ 'wizard-step--active': wizardStep === 3 }">3. Confirm</span>
            </div>
          </div>

          <form class="form-body" @submit.prevent="onCreateSite">
            <p v-if="wizardErrors.length > 0" class="form-error">{{ wizardErrors.join(' ') }}</p>

            <div v-if="wizardStep === 1" class="form-grid">
              <label class="form-field form-field--full">
                <span class="form-label">Select bench</span>
                <select v-model="createForm.benchId" :disabled="benchLoading" class="form-select">
                  <option value="">Choose a bench…</option>
                  <option v-for="bench in creatableBenches" :key="bench.id" :value="bench.id">
                    {{ bench.name }} ({{ bench.status }})
                  </option>
                </select>
              </label>
            </div>

            <div v-if="wizardStep === 2" class="form-grid">
              <label class="form-field form-field--full">
                <span class="form-label">Site name</span>
                <input v-model="createForm.name" type="text" required placeholder="my-site.local" class="form-input" />
                <p v-if="createForm.name" class="form-help">Path: {{ createForm.path }}</p>
              </label>
              <div class="form-field form-field--full form-field--switch">
                <Switch
                  v-model="createForm.force"
                  label="Force"
                  description="Overwrite existing site"
                />
              </div>
              <label class="form-field form-field--full">
                <span class="form-label">Apps</span>
                <AppPicker
                  v-model="createForm.appsSelected"
                  :disabled="creating || loading"
                  :frappe-version="selectedBench?.frappeVersion"
                />
              </label>
            </div>

            <div v-if="wizardStep === 3" class="wizard-summary">
              <div class="wizard-summary__row"><span>Bench</span><strong>{{ selectedBench?.name ?? createForm.benchId }}</strong></div>
              <div class="wizard-summary__row"><span>Site</span><strong>{{ createForm.name }}</strong></div>
              <div class="wizard-summary__row"><span>Path</span><strong>{{ createForm.path }}</strong></div>
              <div class="wizard-summary__row" v-if="createForm.force"><span>Force</span><strong>Yes (Overwrite)</strong></div>
              <div class="wizard-summary__row"><span>Apps</span><strong>{{ selectedApps.length > 0 ? selectedApps.join(', ') : 'None' }}</strong></div>
            </div>
          </form>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button v-if="wizardStep > 1" theme="gray" variant="subtle" @click="onPreviousStep">Back</Button>
          <Button v-if="wizardStep < 3" theme="gray" variant="solid" @click="onNextStep">Next</Button>
          <Button v-if="wizardStep === 3" theme="gray" variant="solid" :loading="creating" :disabled="loading" @click="onCreateSite">
            {{ creating ? 'Creating…' : 'Create site' }}
          </Button>
        </div>
      </template>
    </Dialog>

    <StatePanel
      v-if="!error && loading"
      kind="loading"
      title="Loading sites"
      body="Fetching sites and active status metadata."
    />

    <section v-if="!error && !loading && sites.length === 0" class="bench-empty-state">
      <div class="bench-empty-state__content">
        <h2 class="bench-empty-state__title">No sites yet</h2>
        <p class="bench-empty-state__description">Create your first site to manage runtime status, inspect logs, and open paths quickly.</p>
        <div v-if="creatableBenches.length > 0" class="bench-empty-state__actions">
          <Button theme="gray" variant="solid" @click="showCreateSiteModal = true">Create site</Button>
        </div>
        <div v-else class="bench-empty-state__actions">
          <Button theme="gray" variant="subtle" @click="$router.push('/benches')">Go to Benches</Button>
        </div>
      </div>
    </section>

    <!-- Filters -->
    <div v-if="!error && !loading && sites.length > 0" class="filter-bar">
      <select v-model="siteFilters.benchId" class="filter-bar__select">
        <option value="">All benches</option>
        <option v-for="bench in allBenches" :key="bench.id" :value="bench.id">{{ bench.name }}</option>
      </select>
      <select v-model="siteFilters.status" class="filter-bar__select">
        <option value="">All statuses</option>
        <option value="running">Running</option>
        <option value="stopped">Stopped</option>
        <option value="queued">Queued</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
      </select>
      <input v-model="siteFilters.search" type="text" class="filter-bar__search" placeholder="Search sites…" />
    </div>

    <StatePanel
      v-if="!error && !loading && sites.length > 0 && filteredSites.length === 0"
      kind="empty"
      title="No matching sites"
      body="Adjust your filters to see more results."
    />
    <div v-if="!error && !loading && filteredSites.length > 0" class="activity-list-container">
      <ListView
        :columns="siteColumns"
        :rows="filteredSites"
        row-key="id"
        :options="siteListOptions"
      >
        <template #default>
          <ListHeader class="activity-list-header" />
          <ListRows class="activity-list-rows" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'name'">
            <div class="list-col list-col--name">
              <p class="list-col__primary">{{ row.name }}</p>
              <p class="list-col__secondary">{{ row.path }}</p>
            </div>
          </template>
          <template v-else-if="column.key === 'benchId'">
            <span class="cell-text cell-text--secondary">{{ getBenchName(row.benchId) }}</span>
          </template>

          <template v-else-if="column.key === 'appCount'">
            <span class="cell-text cell-text--secondary">{{ row.appCount }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <span
              class="status-pill status-pill--interactive"
              :class="`status-pill--${row.status}`"
              @click.stop="onStatusClick(row.id, 'site')"
            >
              {{ formatStatusLabel(row) }}
              <span v-if="isResourceBusy(row.id, 'site')" class="status-spinner"></span>
            </span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="list-col list-col--actions">
              <Dropdown :options="getSiteActions(row)">
                <template #default>
                  <button class="btn btn--subtle btn--sm">
                    <IconMoreHorizontal class="w-4 h-4" />
                  </button>
                </template>
              </Dropdown>
            </div>
          </template>
        </template>
      </ListView>
    </div>

    <Dialog
      v-model="showLogsDialog"
      :options="{ title: `Site Logs: ${activeSiteLogName}`, size: '3xl' }"
    >
      <template #body-content>
        <div class="logs-panel-dialog">
          <header class="logs-panel__header">
            <div class="flex items-center gap-4 w-full">
              <select v-model="siteLogLevel" class="logs-panel__level">
                <option value="all">All levels</option>
                <option value="info">Info</option>
                <option value="error">Error</option>
              </select>
              <input v-model="siteLogFilter" class="logs-panel__filter" type="text" placeholder="Filter logs…" />
            </div>
          </header>
          <div class="logs-container">
            <div v-if="!filteredSiteLogs.length" class="empty-logs">
              No logs found matching your filter.
            </div>
            <ul v-else class="logs-list">
              <li v-for="entry in filteredSiteLogs" :key="entry.id" class="logs-list__item" :class="`logs-list__item--${entry.level}`">
                <div class="logs-list__message">{{ entry.message }}</div>
                <div class="logs-list__meta">{{ entry.level }} · {{ entry.timestamp }}</div>
              </li>
            </ul>
          </div>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button theme="gray" variant="solid" @click="showLogsDialog = false">Close</Button>
        </div>
      </template>
    </Dialog>

    <ConfirmationDialog
      :open="deleteConfirmOpen"
      title="Delete site"
      :message="`Delete site ${pendingDeleteSiteName}? Type the site name to confirm.`"
      confirm-label="Delete site"
      :confirmation-phrase="pendingDeleteSiteName || null"
      :typed-value="deleteTypedValue"
      @update:typedValue="onDeleteTypedValue"
      @cancel="onCancelDeleteSite"
      @confirm="onConfirmDeleteSite"
    />

    <TaskLogModal
      v-if="selectedTask"
      :task="selectedTask"
      @close="selectedTaskId = null"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Badge, Button, Dialog, Dropdown, ListView, ListHeader, ListRows, ListEmptyState, Switch, toast } from 'frappe-ui';
import IconPlus from '~icons/lucide/plus';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconCheckCircle from '~icons/lucide/check-circle';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconExternalLink from '~icons/lucide/external-link';
import IconPlay from '~icons/lucide/play';
import IconSquare from '~icons/lucide/square';
import IconFileText from '~icons/lucide/file-text';
import IconFolder from '~icons/lucide/folder';
import IconTrash from '~icons/lucide/trash-2';
import IconDownload from '~icons/lucide/download';
import type { FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import type { LifecycleLogItem } from '../../shared/ipc';
import AppPicker from '../components/AppPicker.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import FirstRunGuide from '../components/FirstRunGuide.vue';
import StatePanel from '../components/StatePanel.vue';
import TaskLogModal from '../components/TaskLogModal.vue';
import { useIpc } from '../composables/useIpc';

const ipc = useIpc();
import { useSites } from '../composables/useSites';
import { useProgressCenter } from '../composables/useProgressCenter';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import {
  buildSiteCreatePayload,
  getSiteWizardStepErrors,
  suggestSitePath,
  type SiteWizardStep,
} from '../site-wizard';
import { filterSites } from '../site-filters';
import { canStartSiteFromUi, canStopSiteFromUi } from '../site-action-guards';
import { filterSiteLogs, type LogLevelFilter } from '../site-log-filters';

const {
  sites,
  loading,
  creating,
  updating,
  deleting,
  loadingLogs,
  openingFolder,
  error,
  successMessage,
  create,
  update,
  remove,
  listLogs,
  openFolder,
  refresh,
} = useSites();

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();



onBeforeUnmount(() => {
  clearPageHeaderActions();
});

const { tasks } = useProgressCenter();
const selectedTaskId = ref<string | null>(null);

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});

const formatStatusLabel = (row: any) => {
  // Check for active tasks first
  const task = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'site' && (t.status === 'running' || t.status === 'queued')
  );

  if (task) {
    const name = task.taskName.toLowerCase();
    if (name.includes('create site')) return 'Creating';
    if (name.includes('stop site')) return 'Stopping';
    if (name.includes('start site')) return 'Starting';
    if (name.includes('delete site')) return 'Deleting';
    return task.stepName || 'Processing';
  }

  if (row.status === 'running') return 'Running';
  if (row.status === 'stopped') return 'Stopped';
  if (row.status === 'queued') return 'Queued';
  if (row.status === 'failure') return 'Failed';
  return row.status;
};

const isResourceBusy = (id: string, resource: 'bench' | 'site') => {
  const task = (tasks.value || []).find(t => t.resourceId === id && t.resource === resource);
  return task && (task.status === 'running' || task.status === 'queued');
};

const onStatusClick = (resourceId: string, resource: 'bench' | 'site') => {
  // Find by resource ID and type
  const task = tasks.value.find(t => t.resourceId === resourceId && t.resource === resource);
  
  if (task) {
    selectedTaskId.value = task.taskId;
    return;
  }

  // Fallback 1: Try finding any recent task for this resource type that isn't successful
  const recentTask = tasks.value.find(t => t.resource === resource && t.status !== 'success');
  if (recentTask) {
    selectedTaskId.value = recentTask.taskId;
    return;
  }

  // Fallback 2: Just find the most recent task for this resource type
  const anyTask = tasks.value.find(t => t.resource === resource);
  if (anyTask) {
    selectedTaskId.value = anyTask.taskId;
  }
};

const siteColumns = [
  { key: 'name', label: 'Site', width: 'minmax(200px, 2fr)' },
  { key: 'benchId', label: 'Bench', width: '120px' },
  { key: 'appCount', label: 'Apps', width: '80px' },
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'actions', label: '', width: '60px' },
];

const siteListOptions = computed(() => ({
  selectable: false,
  showTooltip: false,
  rowHeight: '52px',
  emptyState: {
    title: 'No Sites',
    description: 'No matching sites found for current filters.',
  },
}));

const getSiteActions = (site: any) => {
  const actions = [];

  if (site.status === 'running') {
    const bench = allBenches.value.find(b => b.id === site.benchId);
    const port = bench?.httpPort ?? 8080;
    actions.push({
      label: 'View',
      icon: IconExternalLink,
      onClick: () => window.open(`http://${site.name}:${port}`, '_blank'),
    });
  }

  actions.push({
    label: site.status === 'running' ? 'Restart' : 'Start',
    icon: IconPlay,
    disabled: updating.value || !canStartSite(site.id),
    onClick: () => onSetSiteStatus(site.id, 'running'),
  });

  actions.push({
    label: 'Stop',
    icon: IconSquare,
    disabled: updating.value || !canStopSite(site.id),
    onClick: () => onSetSiteStatus(site.id, 'stopped'),
  });

  actions.push({
    label: 'Logs',
    icon: IconFileText,
    disabled: loadingLogs.value,
    onClick: () => onLoadSiteLogs(site.id),
  });

  actions.push({
    label: 'Open Folder',
    icon: IconFolder,
    disabled: openingFolder.value,
    onClick: () => onOpenSiteFolder(site.id),
  });

  actions.push({
    label: 'Export',
    icon: IconDownload,
    disabled: exporting.value,
    onClick: () => onExportSite(site.id, site.name),
  });

  actions.push({
    label: 'Delete',
    icon: IconTrash,
    theme: 'red',
    disabled: updating.value || deleting.value || isResourceBusy(site.id, 'site'),
    onClick: () => onDeleteSite(site.id, site.name),
  });

  return actions;
};

const exporting = ref(false);

const createForm = reactive({
  name: '',
  benchId: '',
  groupId: '',
  path: '',
  appsText: '',
  appsSelected: [] as string[],
  force: false,
});

const showCreateSiteModal = ref(false);
const wizardStep = ref<SiteWizardStep>(1);
const wizardErrors = ref<string[]>([]);
const allBenches = ref<Awaited<ReturnType<ReturnType<typeof useIpc>['listBenches']>>>([]);
const benchLoading = ref(false);
const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));

const selectedBench = computed(() => allBenches.value.find((bench) => bench.id === createForm.benchId) ?? null);
const selectedApps = computed(() => createForm.appsSelected);
const siteFilters = reactive({
  benchId: '',
  status: '',
  search: '',
});
const filteredSites = computed(() => filterSites(sites.value, siteFilters));
const siteSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Go to Benches', to: '/benches' },
  { label: 'Review runtime health', to: '/settings' },
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

watch(
  () => createForm.benchId,
  () => {
    applyPathDefault();
  }
);

watch(
  () => createForm.name,
  () => {
    applyPathDefault();
  }
);

const onNextStep = async () => {
  const errors = getSiteWizardStepErrors(wizardStep.value, createForm);

  if (wizardStep.value === 2) {
    // 1. Check against local site list (database)
    const duplicateInDb = sites.value.find(s => s.name === createForm.name.trim());
    if (duplicateInDb && !createForm.force) {
      errors.push(`A site named "${createForm.name}" already exists in the database. Enable "Force create" to overwrite.`);
    }

    // 2. Check against filesystem
    if (!createForm.force) {
      const exists = await ipc.pathExists(createForm.path);
      if (exists) {
        errors.push('Site already exists at this path. Enable "Force create" to overwrite.');
      }
    }
  }

  wizardErrors.value = errors;

  if (errors.length > 0) {
    return;
  }

  if (wizardStep.value < 3) {
    wizardStep.value = (wizardStep.value + 1) as SiteWizardStep;
  }
};

const onPreviousStep = () => {
  wizardErrors.value = [];
  if (wizardStep.value > 1) {
    wizardStep.value = (wizardStep.value - 1) as SiteWizardStep;
  }
};

const getBenchName = (id: string) => {
  const bench = allBenches.value.find((b) => b.id === id);
  return bench ? bench.name : id;
};

const onCreateSite = async () => {
  const result = buildSiteCreatePayload(createForm);
  wizardErrors.value = result.errors;

  if (!result.payload) {
    return;
  }

  await create(result.payload);

  showCreateSiteModal.value = false;
  createForm.name = '';
  createForm.benchId = '';
  createForm.groupId = '';
  createForm.path = '';
  createForm.appsText = '';
  createForm.appsSelected = [];
  wizardStep.value = 1;
  wizardErrors.value = [];
  await loadBenchOptions();
};

const onSetSiteStatus = async (id: string, status: 'running' | 'stopped') => {
  await update(id, { status });
};

const activeSiteLogId = ref<string | null>(null);
const siteLogs = ref<LifecycleLogItem[]>([]);
const siteLogFilter = ref('');
const siteLogLevel = ref<LogLevelFilter>('all');

const filteredSiteLogs = computed(() => {
  return filterSiteLogs(siteLogs.value, siteLogFilter.value, siteLogLevel.value);
});

const canStartSite = (siteId: string): boolean => {
  const site = sites.value.find((entry) => entry.id === siteId);
  if (!site) {
    return false;
  }

  return canStartSiteFromUi(site, allBenches.value);
};

const canStopSite = (siteId: string): boolean => {
  const site = sites.value.find((entry) => entry.id === siteId);
  if (!site) {
    return false;
  }

  return canStopSiteFromUi(site);
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
  if (!id) {
    onCancelDeleteSite();
    return;
  }

  deleteConfirmOpen.value = false;
  await remove(id);
  onCancelDeleteSite();
};

const onDeleteTypedValue = (value: string): void => {
  deleteTypedValue.value = value;
};

const showLogsDialog = ref(false);
const activeSiteLogName = ref('');

const onLoadSiteLogs = async (id: string) => {
  const site = sites.value.find(s => s.id === id);
  activeSiteLogName.value = site?.name || id;
  siteLogs.value = await listLogs(id);
  siteLogFilter.value = '';
  siteLogLevel.value = 'all';
  activeSiteLogId.value = id;
  showLogsDialog.value = true;
};

const onCloseSiteLogs = () => {
  showLogsDialog.value = false;
  activeSiteLogId.value = null;
  siteLogs.value = [];
  siteLogFilter.value = '';
  siteLogLevel.value = 'all';
};

const onOpenSiteFolder = async (id: string) => {
  await openFolder(id);
};

const onExportSite = async (id: string, name: string) => {
  try {
    exporting.value = true;

    
    // Prompt user for output directory
    const outputDir = window.prompt(`Enter output directory path for exporting "${name}":`);
    if (!outputDir || !outputDir.trim()) {
      return;
    }
    
    const result = await ipc.exportSitePackage({
      siteId: id,
      outputDirectory: outputDir.trim(),
    });
    
    // TODO: Show success message with artifact directory path
    // successMessage.value = `Site exported successfully to ${result.artifactDirectory}`;
    console.log('Export result:', result);
  } catch (err) {
    console.error('Export failed:', err);
    // TODO: Set error message
  } finally {
    exporting.value = false;
  }
};

onMounted(() => {
  void loadBenchOptions();
});

watch([() => loading.value, () => creatableBenches.value.length], () => {
  const actions = [];

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

  actions.push({
    id: 'sites-refresh',
    label: loading.value ? 'Refreshing…' : 'Refresh',
    variant: 'subtle',
    disabled: loading.value,
    icon: IconRotateCcw,
    onClick: () => {
      void refresh();
    },
  });

  setPageHeaderActions(actions);
}, { immediate: true });
</script>

<style scoped>
.activity-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-list-container {
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.cell-text {
  font-size: 13px;
  line-height: 1.4;
}

.cell-text--secondary {
  color: var(--text-secondary);
}

/* ListView Overrides to match design system */
.activity-list-header {
  background-color: var(--surface-subtle) !important;
  border-bottom: 1px solid var(--border-light) !important;
  margin-bottom: 0 !important;
  padding: 10px 16px !important;
  border-radius: 0 !important;
}

.activity-list-rows {
  padding: 0 !important;
}

:deep(.frappe-list-row) {
  border-bottom: 1px solid var(--border-light) !important;
  padding: 0 16px !important;
  transition: background-color 100ms ease;
  height: 52px !important;
}

:deep(.frappe-list-row:last-child) {
  border-bottom: none !important;
}

:deep(.frappe-list-row:hover) {
  background-color: var(--surface-hover) !important;
}

.activity-list-empty {
  padding: 80px 20px !important;
  background: var(--surface-card);
}

.bench-empty-state {
  min-height: clamp(300px, 40vh, 500px);
  display: grid;
  place-items: center;
  padding: 24px;
}

.bench-empty-state__content {
  max-width: 520px;
  text-align: center;
}

.bench-empty-state__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
}

.bench-empty-state__description {
  margin: 10px 0 0;
  font-size: 16px;
  line-height: 1.35;
  color: var(--text-secondary);
}

.bench-empty-state__actions {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

.sites-view {
  display: grid;
  gap: 16px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.btn--subtle {
  border-color: var(--border-default);
  background: var(--surface-card);
}

.btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-text);
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn--danger {
  border-color: var(--red-border);
  color: var(--red-text);
  background: var(--surface-card);
}

.btn--danger:hover:not(:disabled) {
  background: var(--red-light);
}

.btn--sm {
  min-height: 24px;
  padding: 0 8px;
  font-size: 11px;
}

/* Alert */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.alert--success {
  color: var(--green-text);
  background: var(--green-light);
  border: 1px solid var(--green-border);
}

/* Form card */
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.form-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
}

.form-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-body {
  padding: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.form-field {
  display: grid;
  gap: 4px;
}

.form-field--full {
  grid-column: span 2;
}

.form-field--switch {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  margin-top: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--red-text);
}

.form-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
}

/* Wizard steps */
.wizard-steps {
  display: flex;
  gap: 4px;
}

.wizard-step {
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--surface-subtle);
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}

.wizard-step--active {
  background: var(--primary);
  color: var(--primary-text);
  border-color: var(--primary);
}

.wizard-step--done {
  background: var(--green-light);
  color: var(--green-text);
  border-color: var(--green-border);
}

.wizard-summary {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 6px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-light);
}

.wizard-summary__row {
  display: flex;
  gap: 12px;
  font-size: 13px;
}

.wizard-summary__row span {
  min-width: 80px;
  color: var(--text-secondary);
}

.wizard-summary__row strong {
  color: var(--text-primary);
  font-weight: 500;
}

/* Filter bar */
.filter-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-bar__select {
  min-width: 140px;
}

.filter-bar__search {
  flex: 1;
  min-width: 200px;
}

/* List table */
.list-table {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.list-col--name {
  min-width: 0;
}

.list-col__primary {
  margin: 0;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-col__secondary {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-col--meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.list-col--actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Status pill */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--gray-light);
  color: var(--gray-text);
  text-transform: capitalize;
}

.status-pill--interactive {
  cursor: pointer;
  transition: filter 100ms ease;
}

.status-pill--interactive:hover {
  filter: brightness(0.95);
}

.status-pill--running,
.status-pill--success {
  background: var(--green-light, #f0fdf4);
  color: var(--green-text, #166534);
}

.status-pill--queued {
  background: var(--blue-light, #eff6ff);
  color: var(--blue-text, #1e40af);
}

.status-pill--stopped {
  background: var(--gray-light, #f3f4f6);
  color: var(--gray-text, #4b5563);
}

.status-pill--failure {
  background: var(--red-light, #fef2f2);
  color: var(--red-text, #991b1b);
}

.status-spinner {
  display: block;
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.form-help {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.site-wizard-dialog {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 65vh;
  overflow-y: auto;
  padding: 2px;
}

.wizard-header {
  margin-bottom: 4px;
}

/* Logs panel */
.logs-panel-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 500px;
  margin: -16px;
}

.logs-panel__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--surface-subtle);
}

.logs-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.empty-logs {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.logs-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.logs-list__item {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--surface-subtle);
}

.logs-list__item--error {
  background: var(--red-light);
}

.logs-list__message {
  margin: 0;
  font-size: 12px;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.logs-list__meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>