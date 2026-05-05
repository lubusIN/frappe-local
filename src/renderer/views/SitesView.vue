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
            <p v-if="wizardErrors.length > 0" class="text-red-500 text-sm mb-4">{{ wizardErrors.join(' ') }}</p>

            <div v-if="wizardStep === 1" class="form-grid">
              <label class="form-field">
                <span class="text-xs font-medium text-gray-600 mb-1">Select bench</span>
                <select v-model="createForm.benchId" :disabled="benchLoading" class="p-2 border rounded">
                  <option value="">Choose a bench…</option>
                  <option v-for="bench in creatableBenches" :key="bench.id" :value="bench.id">
                    {{ bench.name }} ({{ bench.status }})
                  </option>
                </select>
              </label>
            </div>

            <div v-if="wizardStep === 2" class="form-grid">
              <label class="form-field">
                <span class="text-xs font-medium text-gray-600 mb-1">Site name</span>
                <input v-model="createForm.name" type="text" required placeholder="my-site.local" class="p-2 border rounded" />
              </label>
              <div class="flex items-center gap-2">
                <Switch
                  v-model="createForm.force"
                  label="Force create"
                />
              </div>
              <label class="form-field">
                <span class="text-xs font-medium text-gray-600 mb-1">Apps</span>
                <AppPicker
                  v-model="createForm.appsSelected"
                  :disabled="creating || loading"
                  :frappe-version="selectedBench?.frappeVersion"
                />
              </label>
            </div>

            <div v-if="wizardStep === 3" class="wizard-summary p-4 bg-gray-50 rounded">
              <div class="flex justify-between mb-2"><span>Bench</span><strong>{{ selectedBench?.name ?? createForm.benchId }}</strong></div>
              <div class="flex justify-between mb-2"><span>Site</span><strong>{{ createForm.name }}</strong></div>
              <div class="flex justify-between mb-2" v-if="createForm.force"><span>Force</span><strong>Yes</strong></div>
              <div class="flex justify-between"><span>Apps</span><strong>{{ selectedApps.length > 0 ? selectedApps.join(', ') : 'None' }}</strong></div>
            </div>
          </form>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button v-if="wizardStep > 1" variant="subtle" @click="onPreviousStep">Back</Button>
          <Button v-if="wizardStep < 3" variant="solid" @click="onNextStep">Next</Button>
          <Button v-if="wizardStep === 3" variant="solid" :loading="creating" :disabled="loading" @click="onCreateSite">
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

    <section v-if="!error && (!loading || sites.length > 0) && sites.length === 0" class="bench-empty-state">
      <h2 class="bench-empty-state__title">No sites yet</h2>
      <p class="bench-empty-state__description">Create your first site to manage runtime status, inspect logs, and access dashboards.</p>
      <div v-if="creatableBenches.length > 0" class="mt-6">
        <Button variant="solid" @click="showCreateSiteModal = true">Create site</Button>
      </div>
      <div v-else class="mt-6">
        <Button variant="subtle" @click="$router.push('/benches')">Go to Benches</Button>
      </div>
    </section>

    <!-- Filters -->
    <div v-if="!error && !loading && sites.length > 0" class="flex gap-4 mb-6">
      <select v-model="siteFilters.benchId" class="p-2 border rounded text-sm bg-white">
        <option value="">All benches</option>
        <option v-for="bench in allBenches" :key="bench.id" :value="bench.id">{{ bench.name }}</option>
      </select>
      <select v-model="siteFilters.status" class="p-2 border rounded text-sm bg-white">
        <option value="">All statuses</option>
        <option value="running">Running</option>
        <option value="stopped">Stopped</option>
        <option value="queued">In Progress</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
      </select>
      <input v-model="siteFilters.search" type="text" class="p-2 border rounded text-sm bg-white flex-1" placeholder="Search sites…" />
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
            <div class="font-medium text-gray-900">{{ row.name }}</div>
          </div>
        </template>
        <template v-else-if="column.key === 'benchId'">
          <span class="text-sm text-gray-600">{{ getBenchName(row.benchId) }}</span>
        </template>

        <template v-else-if="column.key === 'appCount'">
          <span class="text-sm text-gray-600">{{ row.appCount }}</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <div class="flex items-center">
            <Badge
              :variant="'subtle'"
              :theme="getStatusTheme(row)"
              class="cursor-pointer"
              @click.stop="onStatusClick(row.id, 'site')"
            >
              {{ formatStatusLabel(row) }}
              <span v-if="isResourceBusy(row.id, 'site')" class="ml-1 inline-block w-2 h-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
            </Badge>
          </div>
        </template>
        <template v-else-if="column.key === 'actions'">
          <div class="flex justify-end" @click.stop>
            <Dropdown :options="getSiteActions(row)">
              <template #default>
                <Button variant="subtle" icon="more-horizontal" />
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
      @update:typedValue="val => deleteTypedValue = val"
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
import { useRoute } from 'vue-router';
import { Badge, Button, Dialog, Dropdown, ListView, Switch, toast } from 'frappe-ui';
import IconPlus from '~icons/lucide/plus';
import IconExternalLink from '~icons/lucide/external-link';
import IconPlay from '~icons/lucide/play';
import IconSquare from '~icons/lucide/square';
import IconFolder from '~icons/lucide/folder';
import IconTrash from '~icons/lucide/trash-2';
import type { FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import IconRotateCw from '~icons/lucide/rotate-cw';
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
  suggestSitePath,
  type SiteWizardStep,
} from '../site-wizard';
import { filterSites } from '../site-filters';
import { canStartSiteFromUi, canStopSiteFromUi } from '../site-action-guards';

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

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});

const pendingSiteActions = ref<Record<string, 'starting' | 'restarting' | 'stopping'>>({});

const getPendingSiteAction = (siteId: string) => pendingSiteActions.value[siteId];

const setPendingSiteAction = (siteId: string, action: 'starting' | 'restarting' | 'stopping') => {
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

const formatStatusLabel = (row: any) => {
  const pendingAction = getPendingSiteAction(row.id);
  if (pendingAction === 'starting') return 'Starting';
  if (pendingAction === 'restarting') return 'Restarting';
  if (pendingAction === 'stopping') return 'Stopping';

  const task = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'site' && (t.status === 'running' || t.status === 'queued')
  );

  if (task) {
    const name = String(task.taskName ?? '').toLowerCase();
    if (name.includes('create site')) return 'Creating';
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
  const task = tasks.value.find(
    (t) => t.resourceId === resourceId && t.resource === resource && (t.status === 'running' || t.status === 'queued')
  );
  if (task) {
    selectedTaskId.value = task.taskId;
    return;
  }
  const anyTask = tasks.value.find(t => t.resource === resource);
  if (anyTask) {
    selectedTaskId.value = anyTask.taskId;
  }
};

const getStatusTheme = (row: any) => {
  if (getPendingSiteAction(row.id)) return 'blue';
  if (isResourceBusy(row.id, 'site')) return 'blue';
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
  { key: 'appCount', label: 'Apps', width: '80px' },
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

const getSiteActions = (site: any) => {
  const actions = [];

  if (site.status === 'running') {
    const bench = allBenches.value.find(b => b.id === site.benchId);
    const port = bench?.httpPort ?? 8080;
    actions.push({
      label: 'View',
      icon: IconExternalLink,
      onClick: () => ipc.openExternal(`http://${site.name}:${port}`),
    });
  }

  const isBusy = isResourceBusy(site.id, 'site') || Boolean(getPendingSiteAction(site.id));

  actions.push({
    label: site.status === 'running' ? 'Restart' : 'Start',
    icon: site.status === 'running' ? IconRotateCw : IconPlay,
    disabled: updating.value || isBusy || !canStartSite(site.id),
    onClick: () => onSetSiteStatus(site.id, 'running', site.status),
  });

  actions.push({
    label: 'Stop',
    icon: IconSquare,
    disabled: updating.value || site.status === 'stopped' || isBusy || !canStopSite(site.id),
    onClick: () => onSetSiteStatus(site.id, 'stopped', site.status),
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

const createForm = reactive({
  name: '',
  benchId: '',
  path: '',
  appsSelected: [] as string[],
  force: false,
});

const showCreateSiteModal = ref(false);
const wizardStep = ref<SiteWizardStep>(1);
const wizardErrors = ref<string[]>([]);
const allBenches = ref<any[]>([]);
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

watch(() => createForm.benchId, applyPathDefault);
watch(() => createForm.name, applyPathDefault);

const onNextStep = async () => {
  const errors = getSiteWizardStepErrors(wizardStep.value, createForm);
  if (wizardStep.value === 2) {
    const duplicateInDb = sites.value.find(s => s.name === createForm.name.trim());
    if (duplicateInDb && !createForm.force) {
      errors.push(`A site named "${createForm.name}" already exists in the database. Enable "Force create" to overwrite.`);
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
  if (wizardStep.value < 3) wizardStep.value = (wizardStep.value + 1) as SiteWizardStep;
};

const onPreviousStep = () => {
  wizardErrors.value = [];
  if (wizardStep.value > 1) wizardStep.value = (wizardStep.value - 1) as SiteWizardStep;
};

const getBenchName = (id: string) => {
  const bench = allBenches.value.find((b) => b.id === id);
  return bench ? bench.name : id;
};

const onCreateSite = async () => {
  const result = buildSiteCreatePayload(createForm);
  wizardErrors.value = result.errors;
  if (!result.payload) return;
  await create(result.payload);
  showCreateSiteModal.value = false;
  createForm.name = '';
  createForm.benchId = '';
  createForm.appsSelected = [];
  wizardStep.value = 1;
  wizardErrors.value = [];
  await loadBenchOptions();
};

const onSetSiteStatus = async (id: string, status: 'running' | 'stopped', currentStatus?: string) => {
  if (status === 'running') {
    if (currentStatus === 'running') {
      toast.success('Restarting site...');
      setPendingSiteAction(id, 'restarting');
    } else {
      toast.success('Starting site...');
      setPendingSiteAction(id, 'starting');
    }
  } else {
    toast.success('Stopping site...');
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
  if (!id) {
    onCancelDeleteSite();
    return;
  }
  deleteConfirmOpen.value = false;
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

.wizard-steps {
  display: flex;
  gap: 16px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 12px;
}

.wizard-step {
  font-size: 13px;
  color: var(--text-muted);
}

.wizard-step--active {
  color: var(--primary);
  font-weight: 600;
}

.wizard-step--done {
  color: var(--green-600);
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

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>