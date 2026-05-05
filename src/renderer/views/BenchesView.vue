<template>
  <section class="benches-view">
    <StatePanel
      v-if="error && !benches.length"
      kind="error"
      title="Unable to load benches"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />

    <StatePanel
      v-if="!error && loading"
      kind="loading"
      title="Loading benches"
      body="Fetching the latest bench list and lifecycle state."
    />

    <div v-if="!error && !loading && benches.length" class="bench-list-container">
      <table class="bench-table">
        <thead>
          <tr>
            <th class="bench-th bench-th--name">Name</th>
            <th class="bench-th bench-th--frappe">Frappe</th>
            <th class="bench-th bench-th--apps">Apps</th>
            <th class="bench-th bench-th--status">Status</th>
            <th class="bench-th bench-th--actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in benches"
            :key="row.id"
            class="bench-row"
            @click="onManageBench(row.id)"
          >
            <td class="bench-cell bench-cell--name">
              <div class="list-col list-col--name">
                <p class="list-col__primary">{{ row.name }}</p>
                <p class="list-col__secondary">{{ row.path }}</p>
              </div>
            </td>
            <td class="bench-cell bench-cell--frappe">
              <span class="list-col list-col--meta">{{ row.frappeVersion }}</span>
            </td>
            <td class="bench-cell bench-cell--apps" @click.stop="onShowApps(row)">
              <div class="list-col list-col--meta list-col--right">
                <span class="apps-count-badge">{{ row.appCount }}</span>
              </div>
            </td>
            <td class="bench-cell bench-cell--status">
              <span class="list-col list-col--status">
                <span
                  class="status-pill status-pill--interactive"
                  :class="`status-pill--${row.status}`"
                  @click.stop="onStatusClick(row.id, 'bench')"
                >
                  {{ formatStatusLabel(row) }}
                  <span v-if="isResourceBusy(row.id, 'bench')" class="status-spinner"></span>
                </span>
              </span>
            </td>
            <td class="bench-cell bench-cell--actions" @click.stop>
              <div class="list-col list-col--actions">
                <Dropdown :options="getBenchActions(row)">
                  <template #default="{ open }">
                    <button class="btn btn--subtle btn--sm">
                      <IconMoreHorizontal class="w-4 h-4" />
                    </button>
                  </template>
                </Dropdown>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section v-if="!error && !loading && !benches.length" class="bench-empty-state">
      <div class="bench-empty-state__content">
        <h2 class="bench-empty-state__title">No benches found</h2>
        <p class="bench-empty-state__description">Create a new bench to get started.</p>
        <div class="bench-empty-state__actions">
          <Button theme="gray" variant="solid" @click="showCreateBenchModal = true">Create</Button>
        </div>
      </div>
    </section>

    <Dialog
      v-model="showLogsDialog"
      :options="{ title: 'Bench Logs', size: '3xl' }"
    >
      <template #body-content>
        <div class="logs-panel-dialog">
          <header class="logs-panel__header">
            <input v-model="benchLogFilter" class="logs-panel__filter" type="text" placeholder="Filter logs…" />
          </header>
          <div class="logs-container">
            <div v-if="!filteredBenchLogs.length" class="empty-logs">
              No logs found matching your filter.
            </div>
            <ul v-else class="logs-list">
              <li v-for="entry in filteredBenchLogs" :key="entry.id" class="logs-list__item" :class="`logs-list__item--${entry.level}`">
                <div class="logs-list__message">{{ entry.message }}</div>
                <div class="logs-list__meta">{{ entry.timestamp }}</div>
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
      title="Delete bench"
      :message="`Delete bench ${pendingDeleteBenchName}? This cannot be undone.`"
      confirm-label="Delete bench"
      @cancel="onCancelDelete"
      @confirm="onConfirmDelete"
    />

    <Dialog v-model="showCreateBenchModal" :options="{ title: 'New bench', size: '3xl' }">
      <template #body-content>
        <div class="bench-dialog-form">
          <div class="bench-dialog-form__grid">
            <div class="form-field">
              <FormLabel label="Name" />
              <input v-model="createForm.name" type="text" required placeholder="my-bench" />
            </div>
            <div class="form-field">
              <FormLabel label="Frappe Version" />
              <FrappeVersionSelect v-model="createForm.frappeVersion" />
            </div>
            <label class="form-field">
              <span class="form-label">Path</span>
              <div class="path-picker">
                <input v-model="createForm.path" type="text" required placeholder="/path/to/bench" />
                <Button theme="gray" variant="subtle" type="button" @click="triggerFolderPicker">Browse</Button>
              </div>
            </label>
            <label class="form-field">
              <span class="form-label">Apps to include</span>
              <div class="bench-dialog-form__apps-row">
                <Button theme="gray" variant="subtle" type="button" @click="showAppPicker = true">
                  {{ createForm.appsSelected.length ? `${createForm.appsSelected.length} Apps Selected` : 'Select Apps' }}
                </Button>
              </div>
            </label>
          </div>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button theme="gray" variant="subtle" @click="showCreateBenchModal = false">Cancel</Button>
          <Button theme="gray" variant="solid" :loading="creating" :disabled="loading" @click="onCreateBench">
            {{ creating ? 'Creating…' : 'Create' }}
          </Button>
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model="showAppPicker"
      :options="{ title: 'Select Apps', size: '2xl' }"
      class="app-picker-dialog"
    >
      <template #body-content>
        <div class="app-picker-dialog__body">
          <AppPicker
            v-model="createForm.appsSelected"
            :disabled="creating || loading"
            :frappe-version="createForm.frappeVersion"
          />
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button theme="gray" variant="solid" @click="showAppPicker = false">Done</Button>
        </div>
      </template>
    </Dialog>

    <TaskLogModal
      v-if="selectedTask"
      :task="selectedTask"
      @close="selectedTaskId = null"
    />

    <Dialog
      v-model="showAppsDialog"
      :options="{ title: `Apps in ${selectedBenchForApps?.name || 'Bench'}`, size: 'lg' }"
    >
      <template #body-content>
        <div class="installed-apps-list">
          <div v-if="!selectedBenchForApps?.apps?.length" class="empty-apps">
            No apps installed.
          </div>
          <table v-else class="installed-apps-table">
            <tbody>
              <tr v-for="appId in selectedBenchForApps.apps" :key="appId" class="installed-app-row">
                <td class="installed-app-cell installed-app-cell--icon">
                  <img v-if="getAppInfo(appId).icon" :src="getAppInfo(appId).icon" class="app-icon" />
                  <div v-else class="app-icon-fallback">{{ getAppInfo(appId).name.charAt(0).toUpperCase() }}</div>
                </td>
                <td class="installed-app-cell installed-app-cell--info">
                  <div class="app-name">{{ getAppInfo(appId).name }}</div>
                  <div class="app-desc">{{ getAppInfo(appId).description }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button theme="gray" variant="solid" @click="showAppsDialog = false">Close</Button>
        </div>
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Dialog, Dropdown, Select, FormLabel, toast } from 'frappe-ui';
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
import IconTerminal from '~icons/lucide/terminal';
import AppPicker from '../components/AppPicker.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import StatePanel from '../components/StatePanel.vue';
import TaskLogModal from '../components/TaskLogModal.vue';
import FrappeVersionSelect from '../components/FrappeVersionSelect.vue';
import { useBenches } from '../composables/useBenches';
import { useIpc } from '../composables/useIpc';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import { useSettings } from '../composables/useSettings';
import { useProgressCenter } from '../composables/useProgressCenter';
import { useAppCatalog } from '../composables/useAppCatalog';

const {
  benches,
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
  cleanSites,
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

const { state: catalogState } = useAppCatalog();
const showAppsDialog = ref(false);
const showLogsDialog = ref(false);
const selectedBenchForApps = ref<any>(null);

const onShowApps = (bench: any) => {
  selectedBenchForApps.value = bench;
  showAppsDialog.value = true;
};

const getAppInfo = (appId: string) => {
  return catalogState.value.data?.find(a => a.id === appId) || { id: appId, name: appId, description: '' };
};

const router = useRouter();

const onManageBench = (id: string) => {
  router.push({ name: 'sites', query: { benchId: id } });
};

const getBenchActions = (bench: any) => {
  const isBusy = isResourceBusy(bench.id, 'bench');
  
  const actions = [
    {
      label: 'Sites',
      icon: IconExternalLink,
      onClick: () => onManageBench(bench.id),
    },
    {
      label: 'View Progress',
      icon: IconTerminal,
      onClick: () => onStatusClick(bench.id, 'bench'),
      hidden: !isBusy,
    },
    {
      label: bench.status === 'running' ? 'Restart' : 'Start',
      icon: IconPlay,
      disabled: updating.value || isBusy,
      onClick: () => onSetBenchStatus(bench.id, 'running'),
    },
    {
      label: 'Stop',
      icon: IconSquare,
      disabled: updating.value || bench.status === 'stopped' || isBusy,
      onClick: () => onSetBenchStatus(bench.id, 'stopped'),
    },
    {
      label: 'Logs',
      icon: IconFileText,
      disabled: loadingLogs.value,
      onClick: () => onLoadBenchLogs(bench.id),
    },
    {
      label: 'Open Folder',
      icon: IconFolder,
      disabled: openingFolder.value,
      onClick: () => onOpenBenchFolder(bench.id),
    },
    {
      label: 'Clean Bench',
      icon: IconTrash,
      disabled: updating.value || (bench.status !== 'running' && bench.status !== 'success') || isBusy,
      onClick: () => {
        if (confirm(`Are you sure you want to clean all sites from bench "${bench.name}"? This will drop all databases and delete all site files.`)) {
          void cleanSites(bench.id);
        }
      },
    },
    {
      label: 'Delete',
      icon: IconTrash,
      theme: 'red',
      disabled: updating.value || deleting.value || bench.status === 'running' || isBusy,
      onClick: () => onDeleteBench(bench.id, bench.name),
    },
  ];

  return actions.filter(a => !a.hidden);
};

const { tasks } = useProgressCenter();
const selectedTaskId = ref<string | null>(null);

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});

const formatStatusLabel = (row: any) => {
  // Check for active tasks first to provide live progress labels
  const task = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'bench' && (t.status === 'running' || t.status === 'queued')
  );

  if (task) {
    const name = task.taskName.toLowerCase();
    if (name.includes('create bench')) return 'Creating';
    if (name.includes('restart bench')) return 'Restarting';
    if (name.includes('start bench')) return 'Starting';
    if (name.includes('stop bench')) return 'Stopping';
    if (name.includes('delete bench')) return 'Deleting';
    if (name.includes('clean bench')) return 'Cleaning';
    return task.stepName ? task.stepName.replace(/\.\.\./g, '') : 'Processing';
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


const createForm = reactive({
  name: '',
  path: '',
  frappeVersion: 'version-16',
  appsSelected: [] as string[],
});

const { form: settingsForm } = useSettings();
const showAppPicker = ref(false);
const showCreateBenchModal = ref(false);
const ipc = useIpc();
const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

watchEffect(() => {
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
    {
      id: 'benches-refresh',
      label: loading.value ? 'Refreshing' : 'Refresh',
      variant: 'subtle',
      disabled: loading.value,
      loading: loading.value,
      icon: IconRotateCcw,
      onClick: () => {
        void refresh();
      },
    },
  ]);
});

onBeforeUnmount(() => {
  clearPageHeaderActions();
});

watch(() => createForm.name, (newName, oldName) => {
  const basePath = settingsForm.value.storagePath;
  if (!basePath) return;

  const oldDefaultPath = `${basePath}/benches/${oldName}`;
  const newDefaultPath = `${basePath}/benches/${newName}`;

  if (!createForm.path || createForm.path === oldDefaultPath || createForm.path === `${basePath}/${oldName}`) {
    createForm.path = newDefaultPath;
  }
});

const triggerFolderPicker = async () => {
  const selectedPath = await ipc.pickBenchFolder();
  if (selectedPath) {
    createForm.path = selectedPath;
  }
};

const onCreateBench = async () => {
  await create({
    name: createForm.name,
    path: createForm.path,
    frappeVersion: createForm.frappeVersion,
    apps: [...createForm.appsSelected],
  });

  createForm.name = '';
  createForm.path = '';
  createForm.appsSelected = [];
  showCreateBenchModal.value = false;
};

const onSetBenchStatus = async (id: string, status: 'running' | 'stopped') => {
  const label = status === 'running' ? 'Starting' : 'Stopping';
  toast.success(`${label} bench stack...`);

  await update(id, { status });
};

const activeBenchLogId = ref<string | null>(null);
const benchLogs = ref<Array<{ id: string; level: string; message: string; timestamp: string }>>([]);
const benchLogFilter = ref('');

const filteredBenchLogs = computed(() => {
  const query = benchLogFilter.value.trim().toLowerCase();
  if (!query) {
    return benchLogs.value;
  }

  return benchLogs.value.filter((entry) =>
    `${entry.message} ${entry.level}`.toLowerCase().includes(query)
  );
});

const deleteConfirmOpen = ref(false);
const pendingDeleteBenchId = ref<string | null>(null);
const pendingDeleteBenchName = ref('');

const onDeleteBench = async (id: string, name: string) => {
  pendingDeleteBenchId.value = id;
  pendingDeleteBenchName.value = name;
  deleteConfirmOpen.value = true;
};

const onCancelDelete = (): void => {
  deleteConfirmOpen.value = false;
  pendingDeleteBenchId.value = null;
  pendingDeleteBenchName.value = '';
};

const onConfirmDelete = async (): Promise<void> => {
  const id = pendingDeleteBenchId.value;
  if (!id) {
    onCancelDelete();
    return;
  }

  deleteConfirmOpen.value = false;
  await remove(id);
  onCancelDelete();
};

const onLoadBenchLogs = async (id: string) => {
  benchLogs.value = await listLogs(id);
  benchLogFilter.value = '';
  activeBenchLogId.value = id;
  showLogsDialog.value = true;
};

const onOpenBenchFolder = async (id: string) => {
  await openFolder(id);
};
</script>

<style scoped>
.benches-view {
  display: grid;
  gap: 16px;
}

.bench-empty-state {
  min-height: clamp(360px, 58vh, 560px);
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
  margin-top: 28px;
  display: flex;
  justify-content: center;
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

.form-card__title {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  padding: 16px;
}

.form-field {
  display: grid;
  gap: 4px;
}

.form-field--full {
  grid-column: 1 / -1;
}

.path-picker {
  display: flex;
  gap: 8px;
  align-items: center;
}
.path-picker input[type="text"] {
  flex: 1;
}
.path-picker button {
  height: 32px;
  min-height: 32px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

.bench-dialog-form {
  display: grid;
  gap: 14px;
}

.bench-dialog-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.bench-dialog-form__apps-row {
  display: flex;
  align-items: center;
}
.bench-dialog-form__apps-row button {
  height: 32px;
  min-height: 32px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-actions--end {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .bench-dialog-form__grid {
    grid-template-columns: 1fr;
  }
}

/* List table cells */

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
  font-size: 13px;
}

.list-col--right {
  text-align: right;
  width: 100%;
  padding-right: 8px;
}

.bench-list-container {
  background: white;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 12px;
  overflow-x: auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.bench-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

.bench-th {
  background: var(--surface-subtle, #f8f9fa);
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.bench-th--apps,
.bench-th--actions {
  text-align: right;
}

.bench-row {
  cursor: pointer;
  transition: background-color 100ms ease;
}

.bench-row:hover {
  background-color: var(--surface-subtle, #f8f9fa);
}

.bench-cell {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, #f3f4f6);
}

.bench-row:last-child .bench-cell {
  border-bottom: none;
}

.apps-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--surface-subtle, #f3f4f6);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  transition: all 150ms ease;
}

.bench-cell--apps:hover .apps-count-badge {
  background: var(--primary);
  color: var(--primary-text);
}

.installed-apps-list {
  max-height: 400px;
  overflow-y: auto;
  margin: -16px;
}

.empty-apps {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.installed-apps-table {
  width: 100%;
  border-collapse: collapse;
}

.installed-app-row {
  border-bottom: 1px solid var(--border-light, #f3f4f6);
}

.installed-app-row:last-child {
  border-bottom: none;
}

.installed-app-cell {
  padding: 12px 16px;
}

.installed-app-cell--icon {
  width: 48px;
  padding-right: 0;
}

.app-icon, .app-icon-fallback {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
}

.app-icon-fallback {
  background: var(--surface-subtle, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-muted);
}

.app-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.app-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

.logs-panel__filter {
  width: 100%;
  max-width: none;
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

.logs-list__item--warning {
  background: var(--orange-light);
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

/* App picker dialog — constrain height so the list scrolls instead of overflowing */
.app-picker-dialog__body {
  height: calc(70vh - 120px);
  min-height: 300px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Ensure the dialog content area doesn't overflow */
.app-picker-dialog :deep(.dialog-content) {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

</style>