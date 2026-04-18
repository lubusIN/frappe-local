<template>
  <section class="sites-view">
    <header class="sites-header">
      <div>
        <p class="card-eyebrow">Site Management</p>
        <h3 class="sites-title">Local sites</h3>
      </div>
      <button type="button" class="sites-refresh" @click="refresh" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="error" class="sites-error">{{ error }}</p>
    <p v-if="successMessage" class="sites-success">{{ successMessage }}</p>

    <form class="sites-form" @submit.prevent="onCreateSite">
      <div class="site-wizard-steps sites-field--full">
        <p class="site-wizard-step" :class="{ 'site-wizard-step--active': wizardStep === 1 }">1. Select bench</p>
        <p class="site-wizard-step" :class="{ 'site-wizard-step--active': wizardStep === 2 }">2. Configure site</p>
        <p class="site-wizard-step" :class="{ 'site-wizard-step--active': wizardStep === 3 }">3. Confirm</p>
      </div>

      <p v-if="wizardErrors.length > 0" class="sites-error sites-field--full">{{ wizardErrors.join(' ') }}</p>

      <template v-if="wizardStep === 1">
        <label class="sites-field sites-field--full">
          <span>Bench</span>
          <select v-model="createForm.benchId" :disabled="benchLoading">
            <option value="">Select a bench</option>
            <option v-for="bench in creatableBenches" :key="bench.id" :value="bench.id">
              {{ bench.name }} ({{ bench.status }})
            </option>
          </select>
        </label>
      </template>

      <template v-if="wizardStep === 2">
        <label class="sites-field">
          <span>Name</span>
          <input v-model="createForm.name" type="text" required />
        </label>
        <label class="sites-field">
          <span>Group ID (optional)</span>
          <input v-model="createForm.groupId" type="text" />
        </label>
        <label class="sites-field sites-field--full">
          <span>Path</span>
          <input v-model="createForm.path" type="text" required />
        </label>
        <label class="sites-field sites-field--full">
          <span>Apps (comma separated)</span>
          <input v-model="createForm.appsText" type="text" placeholder="frappe, erpnext" />
        </label>
      </template>

      <template v-if="wizardStep === 3">
        <div class="site-wizard-summary sites-field--full">
          <p><strong>Bench:</strong> {{ selectedBench?.name ?? createForm.benchId }}</p>
          <p><strong>Site:</strong> {{ createForm.name }}</p>
          <p><strong>Path:</strong> {{ createForm.path }}</p>
          <p><strong>Group:</strong> {{ createForm.groupId || 'None' }}</p>
          <p><strong>Apps:</strong> {{ parsedApps.length > 0 ? parsedApps.join(', ') : 'None' }}</p>
        </div>
      </template>

      <div class="sites-actions sites-field--full">
        <button v-if="wizardStep > 1" class="sites-create" type="button" @click="onPreviousStep">
          Back
        </button>

        <button v-if="wizardStep < 3" class="sites-create" type="button" @click="onNextStep">
          Next
        </button>

        <button v-if="wizardStep === 3" class="sites-create" type="submit" :disabled="creating || loading">
          {{ creating ? 'Creating…' : 'Create site' }}
        </button>
      </div>
    </form>

    <div v-if="!error && loading" class="sites-empty">
      <p class="sites-empty-title">Loading sites…</p>
    </div>

    <div v-if="!error && !loading && sites.length === 0" class="sites-empty">
      <p class="sites-empty-title">No sites yet.</p>
      <p class="sites-empty-body">Create your first site to manage runtime status, inspect logs, and open paths quickly.</p>
    </div>

    <section v-if="!error && !loading && sites.length > 0" class="sites-filters">
      <label class="sites-field">
        <span>Filter by bench</span>
        <select v-model="siteFilters.benchId">
          <option value="">All benches</option>
          <option v-for="bench in allBenches" :key="bench.id" :value="bench.id">
            {{ bench.name }}
          </option>
        </select>
      </label>
      <label class="sites-field">
        <span>Filter by status</span>
        <select v-model="siteFilters.status">
          <option value="">All statuses</option>
          <option value="running">running</option>
          <option value="stopped">stopped</option>
          <option value="queued">queued</option>
          <option value="success">success</option>
          <option value="failure">failure</option>
        </select>
      </label>
      <label class="sites-field sites-field--full">
        <span>Search</span>
        <input v-model="siteFilters.search" type="text" placeholder="Search by site, bench, or path" />
      </label>
    </section>

    <div v-if="!error && !loading && sites.length > 0 && filteredSites.length === 0" class="sites-empty">
      <p class="sites-empty-title">No matching sites.</p>
      <p class="sites-empty-body">Adjust filters to see more results.</p>
    </div>

    <ul v-if="!error && !loading && filteredSites.length > 0" class="sites-grid">
      <li v-for="site in filteredSites" :key="site.id" class="site-card">
        <div class="site-card-top">
          <h4 class="site-name">{{ site.name }}</h4>
          <span class="site-status" :class="`site-status--${site.status}`">{{ site.status }}</span>
        </div>
        <p class="site-path">{{ site.path }}</p>
        <dl class="site-meta">
          <div>
            <dt>Bench</dt>
            <dd>{{ site.benchId }}</dd>
          </div>
          <div>
            <dt>Group</dt>
            <dd>{{ site.groupId ?? 'None' }}</dd>
          </div>
          <div>
            <dt>Apps</dt>
            <dd>{{ site.appCount }}</dd>
          </div>
        </dl>
        <div class="site-card-actions">
          <button
            class="site-action"
            type="button"
            :disabled="updating || !canStartSite(site.id)"
            @click="onSetSiteStatus(site.id, 'running')"
          >
            Start
          </button>
          <button
            class="site-action"
            type="button"
            :disabled="updating || !canStopSite(site.id)"
            @click="onSetSiteStatus(site.id, 'stopped')"
          >
            Stop
          </button>
          <button
            class="site-action site-action--danger"
            type="button"
            :disabled="updating || deleting || site.status === 'running'"
            @click="onDeleteSite(site.id, site.name)"
          >
            {{ deleting ? 'Deleting…' : 'Delete' }}
          </button>
          <button
            class="site-action"
            type="button"
            :disabled="loadingLogs"
            @click="onLoadSiteLogs(site.id)"
          >
            {{ loadingLogs ? 'Loading logs…' : 'View logs' }}
          </button>
          <button
            class="site-action"
            type="button"
            :disabled="openingFolder"
            @click="onOpenSiteFolder(site.id)"
          >
            {{ openingFolder ? 'Opening…' : 'Open folder' }}
          </button>
        </div>

        <section v-if="activeSiteLogId === site.id" class="site-logs-panel">
          <header class="site-logs-header">
            <p class="site-logs-title">Recent logs</p>
            <input
              v-model="siteLogFilter"
              class="site-logs-filter"
              type="text"
              placeholder="Filter logs"
            />
          </header>
          <ul class="site-logs-list">
            <li v-for="entry in filteredSiteLogs" :key="entry.id" class="site-log-item">
              <p class="site-log-message">{{ entry.message }}</p>
              <p class="site-log-meta">{{ entry.level }} · {{ entry.timestamp }}</p>
            </li>
          </ul>
        </section>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useIpc } from '../composables/useIpc';
import { useSites } from '../composables/useSites';
import {
  buildSiteCreatePayload,
  getSiteWizardStepErrors,
  parseAppsText,
  suggestSitePath,
  type SiteWizardStep,
} from '../site-wizard';
import { filterSites } from '../site-filters';
import { canStartSiteFromUi, canStopSiteFromUi } from '../site-action-guards';

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

const createForm = reactive({
  name: '',
  benchId: '',
  groupId: '',
  path: '',
  appsText: '',
});

const wizardStep = ref<SiteWizardStep>(1);
const wizardErrors = ref<string[]>([]);
const allBenches = ref<Awaited<ReturnType<ReturnType<typeof useIpc>['listBenches']>>>([]);
const benchLoading = ref(false);
const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));

const selectedBench = computed(() => allBenches.value.find((bench) => bench.id === createForm.benchId) ?? null);
const parsedApps = computed(() => parseAppsText(createForm.appsText));
const siteFilters = reactive({
  benchId: '',
  status: '',
  search: '',
});
const filteredSites = computed(() => filterSites(sites.value, siteFilters));

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
  wizardStep.value = 1;
  wizardErrors.value = [];
  await loadBenchOptions();
};

const onSetSiteStatus = async (id: string, status: 'running' | 'stopped') => {
  await update(id, { status });
};

const activeSiteLogId = ref<string | null>(null);
const siteLogs = ref<Array<{ id: string; level: string; message: string; timestamp: string }>>([]);
const siteLogFilter = ref('');

const filteredSiteLogs = computed(() => {
  const query = siteLogFilter.value.trim().toLowerCase();
  if (!query) {
    return siteLogs.value;
  }

  return siteLogs.value.filter((entry) => `${entry.message} ${entry.level}`.toLowerCase().includes(query));
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

const onDeleteSite = async (id: string, name: string) => {
  const confirmed = window.confirm(`Delete site ${name}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  await remove(id);
};

const onLoadSiteLogs = async (id: string) => {
  siteLogs.value = await listLogs(id);
  siteLogFilter.value = '';
  activeSiteLogId.value = id;
};

const onOpenSiteFolder = async (id: string) => {
  await openFolder(id);
};

onMounted(() => {
  void loadBenchOptions();
});
</script>