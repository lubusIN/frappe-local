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
      v-if="!error && loading && benches.length === 0"
      kind="loading"
      title="Loading benches"
      body="Fetching the latest bench list and lifecycle state."
    />

    <ListView
      v-if="!error && (!loading || benches.length > 0) && benches.length"
      :columns="benchColumns"
      :rows="benches"
      row-key="id"
      :options="benchListOptions"
    >
      <template #cell="{ column, row }">
        <template v-if="column.key === 'name'">
          <div class="py-3 cursor-pointer group" @click="onManageBench(row.id)">
            <div class="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{{ row.name }}</div>
            <div class="text-xs text-gray-500 truncate" :title="row.path">
              {{ formatPath(row.path) }}
            </div>
          </div>
        </template>
        
        <template v-else-if="column.key === 'frappeVersion'">
          <span class="text-sm text-gray-600">{{ row.frappeVersion }}</span>
        </template>

        <template v-else-if="column.key === 'appCount'">
          <span class="text-sm text-gray-600">{{ row.appCount }}</span>
        </template>

        <template v-else-if="column.key === 'status'">
          <div class="flex items-center">
            <Badge
              :variant="'subtle'"
              :theme="getStatusTheme(row.status)"
              class="cursor-pointer"
              @click.stop="onStatusClick(row.id, 'bench')"
            >
              {{ formatStatusLabel(row) }}
              <span v-if="isResourceBusy(row.id, 'bench')" class="ml-1 inline-block w-2 h-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
            </Badge>
          </div>
        </template>

        <template v-else-if="column.key === 'actions'">
          <div class="flex justify-end" @click.stop>
            <Dropdown :options="getBenchActions(row)">
              <template #default>
                <Button variant="subtle" icon="more-horizontal" />
              </template>
            </Dropdown>
          </div>
        </template>
      </template>
    </ListView>

    <section v-if="!error && (!loading || benches.length > 0) && !benches.length" class="bench-empty-state">
      <h2 class="bench-empty-state__title">No benches found</h2>
      <p class="bench-empty-state__description">Create a new bench to get started.</p>
      <Button variant="solid" @click="showCreateBenchModal = true">Create Bench</Button>
    </section>

    <ConfirmationDialog
      :open="cleanConfirmOpen"
      title="Clean bench"
      :message="`Are you sure you want to clean all sites from bench &quot;${pendingCleanBenchName}&quot;? This will drop all databases and remove all site data.`"
      confirm-label="Clean bench"
      @cancel="onCancelClean"
      @confirm="onConfirmClean"
    />

    <ConfirmationDialog
      :open="deleteConfirmOpen"
      title="Delete bench"
      :message="`Delete bench ${pendingDeleteBenchName}? This cannot be undone.`"
      confirm-label="Delete bench"
      @cancel="onCancelDelete"
      @confirm="onConfirmDelete"
    />

    <Dialog v-model="showCreateBenchModal" :options="{ title: 'New bench', description: 'Create a new bench to manage sites and applications.', size: '3xl' }">
      <template #body-content>
        <div class="bench-dialog-form">
          <div class="bench-dialog-form__grid">
            <div class="form-field">
              <FormLabel label="Name" />
              <input v-model="createForm.name" type="text" required placeholder="my-bench" class="p-2 border rounded" />
            </div>
            <div class="form-field">
              <FormLabel label="Frappe Version" />
              <FrappeVersionSelect v-model="createForm.frappeVersion" />
            </div>
            <label class="form-field">
              <span class="text-xs font-medium text-gray-600 mb-1">Path</span>
              <div class="path-picker">
                <input v-model="createForm.path" type="text" required placeholder="/path/to/bench" class="p-2 border rounded" />
                <Button variant="subtle" type="button" @click="triggerFolderPicker">Browse</Button>
              </div>
            </label>
            <label class="form-field">
              <span class="text-xs font-medium text-gray-600 mb-1">Apps to include</span>
              <div class="flex">
                <Button variant="subtle" type="button" @click="showAppPicker = true">
                  {{ createForm.appsSelected.length ? `${createForm.appsSelected.length} Apps Selected` : 'Select Apps' }}
                </Button>
              </div>
            </label>
          </div>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button variant="subtle" @click="showCreateBenchModal = false">Cancel</Button>
          <Button variant="solid" :loading="creating" :disabled="loading" @click="onCreateBench">
            {{ creating ? 'Creating…' : 'Create' }}
          </Button>
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model="showAppPicker"
      :options="{ title: 'Select Apps', size: '2xl' }"
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
          <Button variant="solid" @click="showAppPicker = false">Done</Button>
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
          <div v-if="!selectedBenchForApps?.apps?.length" class="text-center py-8 text-gray-500">
            No apps installed.
          </div>
          <table v-else class="installed-apps-table">
            <tbody>
              <tr v-for="appId in selectedBenchForApps.apps" :key="appId" class="border-b last:border-0">
                <td class="py-3 px-2 w-10">
                  <img v-if="getAppInfo(appId).icon" :src="getAppInfo(appId).icon" class="app-icon" />
                  <div v-else class="w-8 h-8 rounded bg-gray-100 flex items-center justify-center font-bold text-gray-500">
                    {{ getAppInfo(appId).name.charAt(0).toUpperCase() }}
                  </div>
                </td>
                <td class="py-3 px-2">
                  <div class="app-name">{{ getAppInfo(appId).name }}</div>
                  <div class="app-desc text-gray-500 text-xs">{{ getAppInfo(appId).description }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button variant="solid" @click="showAppsDialog = false">Close</Button>
        </div>
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Dialog, Dropdown, ListView, Select, FormLabel, Badge, toast } from 'frappe-ui';
import IconPlus from '~icons/lucide/plus';
import IconExternalLink from '~icons/lucide/external-link';
import IconPlay from '~icons/lucide/play';
import IconSquare from '~icons/lucide/square';
import IconFolder from '~icons/lucide/folder';
import IconTrash from '~icons/lucide/trash-2';
import IconBrushCleaning from '~icons/lucide/brush-cleaning';
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
  openingFolder,
  error,
  successMessage,
  create,
  update,
  remove,
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

const formatPath = (path: string) => {
  if (!path) return '';
  const home = '/Users/lubus';
  if (path.startsWith(home)) {
    return path.replace(home, '~');
  }
  return path;
};

const benchColumns = reactive([
  { label: 'Name', key: 'name', width: 2 },
  { label: 'Frappe', key: 'frappeVersion', width: 1.2 },
  { label: 'Apps', key: 'appCount', width: 0.8 },
  { label: 'Status', key: 'status', width: 1 },
  { label: '', key: 'actions', width: 0.5 },
]);

const getStatusTheme = (status: string) => {
  if (status === 'running') return 'green';
  if (status === 'stopped') return 'gray';
  if (status === 'queued') return 'blue';
  if (status === 'failure') return 'red';
  return 'gray';
};

const benchListOptions = {
  selectable: false,
  showTooltip: true,
  resizeColumn: true,
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
      label: 'Open Folder',
      icon: IconFolder,
      disabled: openingFolder.value,
      onClick: () => onOpenBenchFolder(bench.id),
    },
    {
      label: 'Clean Bench',
      icon: IconBrushCleaning,
      disabled: updating.value || (bench.status !== 'running' && bench.status !== 'success') || isBusy,
      onClick: () => onCleanBench(bench.id, bench.name),
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
  const task = tasks.value.find(t => t.resourceId === resourceId && t.resource === resource);
  
  if (task) {
    selectedTaskId.value = task.taskId;
    return;
  }

  const recentTask = tasks.value.find(t => t.resource === resource && t.status !== 'success');
  if (recentTask) {
    selectedTaskId.value = recentTask.taskId;
    return;
  }

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
  ]);
});

onBeforeUnmount(() => {
  clearPageHeaderActions();
});

watch(() => [createForm.name, settingsForm.value.storagePath], ([newName, storagePath], [oldName]) => {
  if (!storagePath) return;

  const oldDefaultPath = oldName ? `${storagePath}/benches/${oldName}` : '';
  const newDefaultPath = newName ? `${storagePath}/benches/${newName}` : '';

  if (!createForm.path || createForm.path === oldDefaultPath || createForm.path === `${storagePath}/benches` || createForm.path === storagePath) {
    createForm.path = newDefaultPath;
  }
});

const triggerFolderPicker = async () => {
  const selectedPath = await ipc.pickBenchFolder();
  if (selectedPath) {
    const name = createForm.name.trim();
    if (name && !selectedPath.endsWith(name)) {
      createForm.path = selectedPath.endsWith('/') ? `${selectedPath}${name}` : `${selectedPath}/${name}`;
    } else {
      createForm.path = selectedPath;
    }
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

const cleanConfirmOpen = ref(false);
const pendingCleanBenchId = ref<string | null>(null);
const pendingCleanBenchName = ref('');

const onCleanBench = (id: string, name: string) => {
  pendingCleanBenchId.value = id;
  pendingCleanBenchName.value = name;
  cleanConfirmOpen.value = true;
};

const onCancelClean = () => {
  cleanConfirmOpen.value = false;
  pendingCleanBenchId.value = null;
  pendingCleanBenchName.value = '';
};

const onConfirmClean = async () => {
  const id = pendingCleanBenchId.value;
  if (!id) {
    onCancelClean();
    return;
  }

  cleanConfirmOpen.value = false;
  await cleanSites(id);
  onCancelClean();
};

const onOpenBenchFolder = async (id: string) => {
  await openFolder(id);
};
</script>

<style scoped>
.benches-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

:deep(.frappe-list-cell) {
  min-width: 0 !important;
}

.bench-empty-state {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: white;
  border: 1px solid var(--border-light);
  border-radius: 12px;
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

.bench-dialog-form {
  display: grid;
  gap: 16px;
}

.bench-dialog-form__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.path-picker {
  display: flex;
  gap: 8px;
}

.path-picker input {
  flex: 1;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.installed-apps-list {
  padding: 8px;
}

.installed-apps-table {
  width: 100%;
}

.app-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
}

.app-name {
  font-weight: 500;
}

.app-desc {
  font-size: 12px;
  color: var(--text-muted);
}
</style>