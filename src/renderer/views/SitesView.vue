<template>
  <section class="sites-view">
    <header class="view-header">
      <h2 class="view-header__title">Sites</h2>
      <div class="view-header__actions">
        <button type="button" class="btn btn--subtle" @click="refresh" :disabled="loading">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 8A6 6 0 114.8 4.8" /><path d="M14 2v4h-4" />
          </svg>
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load sites"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />

    <div v-if="successMessage" class="alert alert--success">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.78 5.28a.75.75 0 010 1.06l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 011.06-1.06L7.25 8.75l3.47-3.47a.75.75 0 011.06 0z" />
      </svg>
      {{ successMessage }}
    </div>

    <FirstRunGuide
      v-if="!loading && !benchLoading && allBenches.length === 0"
      title="Create a bench before creating sites"
      body="Sites are attached to benches. Once you have one running bench, this screen becomes the main place to create, control, and export sites."
      :steps="siteSetupSteps"
      :links="siteSetupLinks"
      compact
    />

    <!-- Wizard form -->
    <div v-if="allBenches.length > 0" class="form-card">
      <div class="form-card__header">
        <h3 class="form-card__title">Create new site</h3>
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
            <select v-model="createForm.benchId" :disabled="benchLoading">
              <option value="">Choose a bench…</option>
              <option v-for="bench in creatableBenches" :key="bench.id" :value="bench.id">
                {{ bench.name }} ({{ bench.status }})
              </option>
            </select>
          </label>
        </div>

        <div v-if="wizardStep === 2" class="form-grid">
          <label class="form-field">
            <span class="form-label">Site name</span>
            <input v-model="createForm.name" type="text" required placeholder="my-site.local" />
          </label>
          <label class="form-field">
            <span class="form-label">Group ID (optional)</span>
            <input v-model="createForm.groupId" type="text" placeholder="client-a" />
          </label>
          <label class="form-field form-field--full">
            <span class="form-label">Path</span>
            <input v-model="createForm.path" type="text" required placeholder="/path/to/site" />
          </label>
          <label class="form-field form-field--full">
            <span class="form-label">Apps</span>
            <AppPicker
              v-model="createForm.appsSelected"
              :disabled="creating || loading"
              :runtime="selectedBench?.runtime"
              :frappe-version="selectedBench?.frappeVersion"
            />
          </label>
        </div>

        <div v-if="wizardStep === 3" class="wizard-summary">
          <div class="wizard-summary__row"><span>Bench</span><strong>{{ selectedBench?.name ?? createForm.benchId }}</strong></div>
          <div class="wizard-summary__row"><span>Site</span><strong>{{ createForm.name }}</strong></div>
          <div class="wizard-summary__row"><span>Path</span><strong>{{ createForm.path }}</strong></div>
          <div class="wizard-summary__row"><span>Group</span><strong>{{ createForm.groupId || 'None' }}</strong></div>
          <div class="wizard-summary__row"><span>Apps</span><strong>{{ selectedApps.length > 0 ? selectedApps.join(', ') : 'None' }}</strong></div>
        </div>

        <div class="form-actions">
          <button v-if="wizardStep > 1" class="btn btn--subtle" type="button" @click="onPreviousStep">Back</button>
          <button v-if="wizardStep < 3" class="btn btn--primary" type="button" @click="onNextStep">Next</button>
          <button v-if="wizardStep === 3" class="btn btn--primary" type="submit" :disabled="creating || loading">
            {{ creating ? 'Creating…' : 'Create site' }}
          </button>
        </div>
      </form>
    </div>

    <StatePanel
      v-if="!error && loading"
      kind="loading"
      title="Loading sites"
      body="Fetching sites and active status metadata."
    />

    <StatePanel
      v-if="!error && !loading && sites.length === 0"
      kind="empty"
      title="No sites yet"
      body="Create your first site to manage runtime status, inspect logs, and open paths quickly."
    />

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

    <!-- Sites list table -->
    <div v-if="!error && !loading && filteredSites.length > 0" class="list-table">
      <div class="list-table__header">
        <span class="list-col list-col--name">Site</span>
        <span class="list-col list-col--meta">Bench</span>
        <span class="list-col list-col--meta">Group</span>
        <span class="list-col list-col--meta">Apps</span>
        <span class="list-col list-col--status">Status</span>
        <span class="list-col list-col--actions"></span>
      </div>
      <div
        v-for="site in filteredSites"
        :key="site.id"
        class="list-table__row"
      >
        <div class="list-col list-col--name">
          <p class="list-col__primary">{{ site.name }}</p>
          <p class="list-col__secondary">{{ site.path }}</p>
        </div>
        <span class="list-col list-col--meta">{{ site.benchId }}</span>
        <span class="list-col list-col--meta">{{ site.groupId ?? '—' }}</span>
        <span class="list-col list-col--meta">{{ site.appCount }}</span>
        <span class="list-col list-col--status">
          <span class="status-pill" :class="`status-pill--${site.status}`">{{ site.status }}</span>
        </span>
        <div class="list-col list-col--actions">
          <button class="btn btn--subtle btn--sm" :disabled="updating || !canStartSite(site.id)" @click="onSetSiteStatus(site.id, 'running')">Start</button>
          <button class="btn btn--subtle btn--sm" :disabled="updating || !canStopSite(site.id)" @click="onSetSiteStatus(site.id, 'stopped')">Stop</button>
          <button class="btn btn--subtle btn--sm" :disabled="loadingLogs" @click="onLoadSiteLogs(site.id)">Logs</button>
          <button class="btn btn--subtle btn--sm" :disabled="openingFolder" @click="onOpenSiteFolder(site.id)">Folder</button>
          <button class="btn btn--subtle btn--sm" :disabled="exporting" @click="onExportSite(site.id, site.name)">Export</button>
          <button class="btn btn--danger btn--sm" :disabled="updating || deleting || site.status === 'running'" @click="onDeleteSite(site.id, site.name)">Delete</button>
        </div>

        <!-- Logs panel -->
        <section v-if="activeSiteLogId === site.id" class="logs-panel">
          <header class="logs-panel__header">
            <span class="logs-panel__title">Recent logs</span>
            <button type="button" class="btn btn--subtle btn--sm" @click="onCloseSiteLogs">Close</button>
            <select v-model="siteLogLevel" class="logs-panel__level">
              <option value="all">All levels</option>
              <option value="info">Info</option>
              <option value="error">Error</option>
            </select>
            <input v-model="siteLogFilter" class="logs-panel__filter" type="text" placeholder="Filter logs…" />
          </header>
          <ul class="logs-list">
            <li v-for="entry in filteredSiteLogs" :key="entry.id" class="logs-list__item">
              <p class="logs-list__message">{{ entry.message }}</p>
              <p class="logs-list__meta">{{ entry.level }} · {{ entry.timestamp }}</p>
            </li>
          </ul>
        </section>
      </div>
    </div>

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
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import type { LifecycleLogItem } from '../../shared/ipc';
import AppPicker from '../components/AppPicker.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import FirstRunGuide from '../components/FirstRunGuide.vue';
import StatePanel from '../components/StatePanel.vue';
import { useIpc } from '../composables/useIpc';
import { useSites } from '../composables/useSites';
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

const exporting = ref(false);

const createForm = reactive({
  name: '',
  benchId: '',
  groupId: '',
  path: '',
  appsText: '',
  appsSelected: [] as string[],
});

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
const siteSetupSteps = computed(() => [
  'Open Benches and create one local bench with a valid path and runtime.',
  'Start that bench so it becomes selectable here for site creation.',
  'Return to Sites to create your first site, then export or group it later.',
]);
const siteSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Go to Benches', to: '/benches' },
  { label: 'Review runtime health', to: '/settings' },
]);

const loadBenchOptions = async () => {
  benchLoading.value = true;

  try {
    const ipc = useIpc();
    const benches = await ipc.listBenches();
    allBenches.value = benches;
  } catch (err) {
    wizardErrors.value = [String(err)];
  } finally {
    benchLoading.value = false;
  }
};

const applyPathDefault = () => {
  if (!selectedBench.value || !createForm.name.trim()) {
    return;
  }

  if (!createForm.path.trim()) {
    createForm.path = suggestSitePath(selectedBench.value.path, createForm.name);
  }
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

const onNextStep = () => {
  const errors = getSiteWizardStepErrors(wizardStep.value, createForm);
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

const onCreateSite = async () => {
  const result = buildSiteCreatePayload(createForm);
  wizardErrors.value = result.errors;

  if (!result.payload) {
    return;
  }

  await create(result.payload);

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

const onLoadSiteLogs = async (id: string) => {
  siteLogs.value = await listLogs(id);
  siteLogFilter.value = '';
  siteLogLevel.value = 'all';
  activeSiteLogId.value = id;
};

const onCloseSiteLogs = () => {
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
    const ipc = useIpc();
    
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
</script>

<style scoped>
.sites-view {
  display: grid;
  gap: 16px;
}

/* View header */
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.view-header__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.view-header__actions {
  display: flex;
  gap: 8px;
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
  grid-column: 1 / -1;
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

.list-table__header {
  display: grid;
  grid-template-columns: 2fr 1fr 0.8fr 0.5fr 0.8fr 2.5fr;
  gap: 8px;
  padding: 8px 16px;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border-light);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.list-table__row {
  display: grid;
  grid-template-columns: 2fr 1fr 0.8fr 0.5fr 0.8fr 2.5fr;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light);
  align-items: center;
  font-size: 13px;
}

.list-table__row:last-child {
  border-bottom: 0;
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
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--gray-light);
  color: var(--gray-text);
}

.status-pill--running,
.status-pill--success {
  background: var(--green-light);
  color: var(--green-text);
}

.status-pill--failure,
.status-pill--error {
  background: var(--red-light);
  color: var(--red-text);
}

/* Logs panel */
.logs-panel {
  grid-column: 1 / -1;
  border-top: 1px solid var(--border-light);
  padding: 12px 0 0;
  display: grid;
  gap: 8px;
}

.logs-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.logs-panel__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.logs-panel__level {
  min-height: 24px;
  font-size: 11px;
}

.logs-panel__filter {
  flex: 1;
  max-width: 280px;
  min-height: 24px;
  font-size: 11px;
}

.logs-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.logs-list__item {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--surface-subtle);
}

.logs-list__message {
  margin: 0;
  font-size: 12px;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
}

.logs-list__meta {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}
</style>