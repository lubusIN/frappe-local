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
          <div
            class="py-3 cursor-pointer group"
            @click="onManageBench(row.id)"
          >
            <div class="font-medium transition-colors text-ink-gray-9 group-hover:text-ink-blue-3">
              {{ row.name }}
            </div>
            <div
              class="text-xs truncate text-ink-gray-5"
              :title="row.path"
            >
              {{ formatPath(row.path) }}
            </div>
          </div>
        </template>
        
        <template v-else-if="column.key === 'frappeVersion'">
          <span class="text-sm text-ink-gray-6">{{ row.frappeVersion }}</span>
        </template>

        <template v-else-if="column.key === 'appCount'">
          <span class="text-sm text-ink-gray-6">{{ row.appCount }}</span>
        </template>

        <template v-else-if="column.key === 'status'">
          <div class="flex items-center">
            <Badge
              :variant="'subtle'"
              :theme="getStatusTheme(row)"
              class="cursor-pointer status-badge"
              @click.stop="onStatusClick(row.id, 'bench')"
            >
              {{ formatStatusLabel(row) }}
              <span
                v-if="isResourceBusy(row.id, 'bench')"
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
            <Dropdown :options="getBenchActions(row)">
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
    </ListView>

    <section
      v-if="!error && (!loading || benches.length > 0) && !benches.length"
      class="bench-empty-state"
    >
      <h2 class="bench-empty-state__title">
        No benches found
      </h2>
      <p class="bench-empty-state__description">
        Create a new bench to get started.
      </p>
      <Button
        variant="solid"
        @click="showCreateBenchModal = true"
      >
        Create Bench
      </Button>
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

    <Dialog
      v-model="showCreateBenchModal"
      :options="{ title: 'New bench', size: '3xl' }"
      @close="onCloseBenchWizard"
    >
      <template #body-content>
        <div class="bench-wizard-dialog">
          <div class="wizard-header">
            <span :class="['wizard-header__item', wizardStep === 1 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
              Details
            </span>
            <IconChevronRight class="wizard-header__icon" />
            <span :class="['wizard-header__item', wizardStep === 2 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
              Apps
            </span>
            <IconChevronRight class="wizard-header__icon" />
            <span :class="['wizard-header__item', wizardStep === 3 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
              Confirm
            </span>
          </div>

          <form
            class="form-body"
            @submit.prevent="onCreateBench"
          >
            <p
              v-if="wizardErrors.length > 0"
              class="mb-4 text-sm text-ink-red-3"
            >
              {{ wizardErrors.join(' ') }}
            </p>

            <!-- Step 1: Bench Details -->
            <div
              v-if="wizardStep === 1"
              class="form-grid form-grid--bench-details"
            >
              <label class="form-field">
                <FormLabel label="Name" />
                <TextInput
                  v-model="createForm.name"
                  type="text"
                  required
                  placeholder="my-bench"
                  variant="outline"
                />
              </label>

              <label class="form-field">
                <FormLabel label="Frappe Version" />
                <FrappeVersionSelect
                  v-model="createForm.frappeVersion"
                  class="form-field__control"
                />
              </label>

              <label class="form-field">
                <FormLabel label="Path" />
                <div class="path-picker">
                  <div class="path-picker__input-wrap">
                    <TextInput
                      v-model="createForm.path"
                      type="text"
                      required
                      placeholder="/path/to/bench"
                      variant="outline"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="subtle"
                    type="button"
                    @click="triggerFolderPicker"
                  >Browse</Button>
                </div>
              </label>
            </div>

            <!-- Step 2: App Selection -->
            <div
              v-if="wizardStep === 2"
              class="form-grid"
            >
              <label class="form-field">
                <AppPicker
                  v-model="createForm.appsSelected"
                  class="form-field__control"
                  :disabled="creating || loading"
                  :frappe-version="createForm.frappeVersion"
                />
              </label>
            </div>

            <!-- Step 3: Confirmation -->
            <div
              v-if="wizardStep === 3"
              class="p-4 rounded wizard-summary bg-surface-gray-2"
            >
              <div class="flex justify-between mb-2">
                <span>Name</span><strong>{{ createForm.name }}</strong>
              </div>
              <div class="flex justify-between mb-2">
                <span>Frappe Version</span><strong>{{ createForm.frappeVersion }}</strong>
              </div>
              <div class="flex justify-between mb-2">
                <span>Path</span><strong class="font-mono text-xs">{{ createForm.path }}</strong>
              </div>
              <div class="flex justify-between">
                <span>Apps</span><strong>{{ createForm.appsSelected.length > 0 ? createForm.appsSelected.join(', ') : 'frappe' }}</strong>
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
            v-if="wizardStep < 3"
            size="md"
            variant="solid"
            @click="onNextStep"
          >
            Next
          </Button>
          <Button
            v-if="wizardStep === 3"
            size="md"
            variant="solid"
            :loading="creating"
            :disabled="loading"
            @click="onCreateBench"
          >
            {{ creating ? 'Creating…' : 'Create bench' }}
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
          <Button
            size="md"
            variant="solid"
            @click="showAppPicker = false"
          >
            Done
          </Button>
        </div>
      </template>
    </Dialog>

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
      v-model="showAppsDialog"
      :options="{ title: `Apps in ${selectedBenchForApps?.name || 'Bench'}`, size: 'lg' }"
    >
      <template #body-content>
        <div class="installed-apps-list">
          <div
            v-if="!selectedBenchForApps?.apps?.length"
            class="py-8 text-center text-ink-gray-5"
          >
            No apps installed.
          </div>
          <table
            v-else
            class="installed-apps-table"
          >
            <tbody>
              <tr
                v-for="appId in selectedBenchForApps.apps"
                :key="appId"
                class="border-b last:border-0"
              >
                <td class="w-10 px-2 py-3">
                  <img
                    v-if="getAppInfo(appId).icon"
                    :src="getAppInfo(appId).icon"
                    class="app-icon"
                  >
                  <div
                    v-else
                    class="flex items-center justify-center w-8 h-8 font-bold rounded bg-surface-gray-3 text-ink-gray-5"
                  >
                    {{ getAppInfo(appId).name.charAt(0).toUpperCase() }}
                  </div>
                </td>
                <td class="px-2 py-3">
                  <div class="app-name">
                    {{ getAppInfo(appId).name }}
                  </div>
                  <div class="text-xs app-desc text-ink-gray-5">
                    {{ getAppInfo(appId).description }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button
            size="md"
            variant="solid"
            @click="showAppsDialog = false"
          >
            Close
          </Button>
        </div>
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch, watchEffect, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { Badge, Button, Dialog, Dropdown, FormLabel, ListView, TextInput, toast } from 'frappe-ui';
import IconPlus from '~icons/lucide/plus';
import IconExternalLink from '~icons/lucide/external-link';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconPlay from '~icons/lucide/play';
import IconSquare from '~icons/lucide/square';
import IconFolder from '~icons/lucide/folder';
import IconTrash from '~icons/lucide/trash-2';
import IconBrushCleaning from '~icons/lucide/brush-cleaning';
import IconActivity from '~icons/lucide/activity';
import IconRotateCw from '~icons/lucide/rotate-cw';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconPackage from '~icons/lucide/package';
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
import { getBenchWizardStepErrors, buildBenchCreatePayload, type BenchWizardStep } from '../bench-wizard';
import type { BenchListItem, CatalogAppItem } from '../../shared/ipc';
import { humanizeCreateFailure } from '../../shared/runtime-errors';

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
const selectedBenchForApps = ref<BenchListItem | null>(null);

const onShowApps = (bench: BenchListItem) => {
  selectedBenchForApps.value = bench;
  showAppsDialog.value = true;
};

const getAppInfo = (appId: string) => {
  return catalogState.value.data?.find((app) => app.id === appId) ?? ({
    id: appId,
    name: appId,
    description: '',
    source: '',
    version: '',
    category: 'other',
    compatibility: {},
  } satisfies CatalogAppItem);
};

const router = useRouter();

const onManageBench = (id: string) => {
  router.push({ name: 'sites', query: { benchId: id } });
};


const formatPath = (path: string) => {
  if (!path) return '';
  return path.replace(/^\/Users\/[^/]+/, '~');
};

const benchColumns = reactive([
  { label: 'Name', key: 'name', width: 2 },
  { label: 'Frappe', key: 'frappeVersion', width: 1.2 },
  { label: 'Apps', key: 'appCount', width: 0.8 },
  { label: 'Status', key: 'status', width: 1 },
  { label: '', key: 'actions', width: 0.5 },
]);

const pendingBenchActions = ref<Record<string, 'starting' | 'restarting' | 'stopping'>>({});

const getPendingBenchAction = (benchId: string) => pendingBenchActions.value[benchId];

const setPendingBenchAction = (benchId: string, action: 'starting' | 'restarting' | 'stopping') => {
  pendingBenchActions.value = {
    ...pendingBenchActions.value,
    [benchId]: action,
  };
};

const clearPendingBenchAction = (benchId: string) => {
  if (!pendingBenchActions.value[benchId]) {
    return;
  }

  const next = { ...pendingBenchActions.value };
  delete next[benchId];
  pendingBenchActions.value = next;
};

watch(
  benches,
  (nextBenches) => {
    for (const bench of nextBenches) {
      if (bench.status !== 'queued') {
        clearPendingBenchAction(bench.id);
      }
    }
  },
  { deep: true }
);

const getStatusTheme = (row: BenchListItem) => {
  if (getPendingBenchAction(row.id)) return 'blue';
  if (isResourceBusy(row.id, 'bench')) return 'blue';
  const status = row.status;
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

const getBenchActions = (bench: BenchListItem) => {
  const isBusy = isResourceBusy(bench.id, 'bench') || Boolean(getPendingBenchAction(bench.id));

  const actions: Array<{
    label: string;
    icon: Component;
    disabled?: boolean;
    theme?: 'gray' | 'red';
    hidden?: boolean;
    onClick: () => void | Promise<void>;
  }> = [
    {
      label: 'Sites',
      icon: IconExternalLink,
      onClick: () => onManageBench(bench.id),
    },
    {
      label: 'View Progress',
      icon: IconActivity,
      onClick: () => onStatusClick(bench.id, 'bench'),
      hidden: !isBusy,
    },
    {
      label: bench.status === 'running' ? 'Restart' : 'Start',
      icon: bench.status === 'running' ? IconRotateCw : IconPlay,
      disabled: updating.value || isBusy || bench.status === 'queued',
      onClick: () => onSetBenchStatus(bench.id, 'running', bench.status),
    },
    {
      label: 'Stop',
      icon: IconSquare,
      disabled: updating.value || bench.status === 'stopped' || bench.status === 'queued' || isBusy,
      onClick: () => onStopBench(bench.id),
    },
    {
      label: 'Apps',
      icon: IconPackage,
      onClick: () => onShowApps(bench),
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
      theme: 'red' as const,
      disabled: updating.value || deleting.value || bench.status === 'running' || isBusy,
      onClick: () => onDeleteBench(bench.id, bench.name),
    },
  ];

  return actions.filter(a => !a.hidden);
};

const { tasks } = useProgressCenter();
const selectedTaskId = ref<string | null>(null);
const showCreateFailureDialog = ref(false);
const createFailureTitle = ref('Bench Creation Failed');
const createFailureMessage = ref('Bench creation failed. Check Progress for details.');
const acknowledgedCreateFailures = ref(new Set<string>());

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});

const formatStatusLabel = (row: BenchListItem) => {
  const pendingAction = getPendingBenchAction(row.id);
  if (pendingAction === 'starting') return 'Starting';
  if (pendingAction === 'restarting') return 'Restarting';
  if (pendingAction === 'stopping') return 'Stopping';

  const task = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'bench' && (t.status === 'running' || t.status === 'queued')
  );

  if (task) {
    const name = String(task.taskName ?? '').toLowerCase();
    if (name.includes('create bench')) return 'Creating';
    if (name.includes('restart bench')) return 'Restarting';
    if (name.includes('start bench')) return 'Starting';
    if (name.includes('stop bench')) return 'Stopping';
    if (name.includes('delete bench')) return 'Deleting';
    if (name.includes('clean bench')) return 'Cleaning';
    return typeof task.stepName === 'string' && task.stepName.length > 0
      ? task.stepName.replace(/\.\.\./g, '')
      : 'Processing';
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
  const activeTask = tasks.value.find(
    (t) => t.resourceId === resourceId && t.resource === resource && (t.status === 'running' || t.status === 'queued')
  );

  if (activeTask) {
    selectedTaskId.value = activeTask.taskId;
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
    for (const task of items) {
      if (
        task.status === 'failure' &&
        task.resource === 'bench' &&
        task.taskName.toLowerCase().includes('create bench') &&
        !acknowledgedCreateFailures.value.has(task.taskId)
      ) {
        acknowledgedCreateFailures.value.add(task.taskId);
        createFailureTitle.value = 'Bench Creation Failed';
        createFailureMessage.value = humanizeCreateFailure('bench', task.message);
        showCreateFailureDialog.value = true;
      }
    }
  },
  { deep: true }
);

const createForm = reactive({
  name: '',
  path: '',
  frappeVersion: 'version-16',
  appsSelected: [] as string[],
});

const { form: settingsForm } = useSettings();
const showAppPicker = ref(false);
const showCreateBenchModal = ref(false);
const wizardStep = ref<BenchWizardStep>(1);
const wizardErrors = ref<string[]>([]);
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

const onNextStep = () => {
  const errors = getBenchWizardStepErrors(wizardStep.value, createForm);
  wizardErrors.value = errors;
  if (errors.length > 0) return;
  if (wizardStep.value < 3) wizardStep.value = (wizardStep.value + 1) as BenchWizardStep;
};

const onPreviousStep = () => {
  wizardErrors.value = [];
  if (wizardStep.value > 1) wizardStep.value = (wizardStep.value - 1) as BenchWizardStep;
};

const onCreateBench = async () => {
  const result = buildBenchCreatePayload(createForm);
  wizardErrors.value = result.errors;
  if (!result.payload) return;
  
  await create(result.payload);

  createForm.name = '';
  createForm.path = '';
  createForm.appsSelected = [];
  showCreateBenchModal.value = false;
  wizardStep.value = 1;
  wizardErrors.value = [];
};

const onCloseBenchWizard = () => {
  showCreateBenchModal.value = false;
  wizardStep.value = 1;
  wizardErrors.value = [];
  createForm.name = '';
  createForm.path = '';
  createForm.frappeVersion = 'version-16';
  createForm.appsSelected = [];
};

const onStopBench = async (id: string) => {
  await onSetBenchStatus(id, 'stopped');
};

const onSetBenchStatus = async (id: string, status: 'running' | 'stopped', currentStatus?: string) => {
  if (status === 'running') {
    if (currentStatus === 'running') {
      toast.success('Restarting bench...');
    } else {
      toast.success('Starting bench...');
    }
    setPendingBenchAction(id, currentStatus === 'running' ? 'restarting' : 'starting');
  } else {
    toast.success('Stopping bench...');
    setPendingBenchAction(id, 'stopping');
  }

  try {
    await update(id, { status });
  } catch {
    clearPendingBenchAction(id);
  }
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

/* Wizard Styles */
.bench-wizard-dialog {
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

.form-grid--bench-details {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
}

.form-grid--bench-details > :last-child {
  grid-column: 1 / -1;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field__control {
  width: 100%;
}

.path-picker {
  display: flex;
  gap: 8px;
  width: 100%;
}

.path-picker__input-wrap {
  flex: 1;
  min-width: 0;
}

.path-picker :deep(button) {
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .form-grid--bench-details {
    grid-template-columns: 1fr;
  }

  .form-grid--bench-details > :last-child {
    grid-column: auto;
  }
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

.font-mono {
  font-family: 'Monaco', 'Menlo', monospace;
  word-break: break-all;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Keep Select Apps modal capped to viewport while letting its list scroll internally. */
:deep(.dialog-overlay[data-dialog="Select Apps"] .dialog-content) {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

:deep(.dialog-overlay[data-dialog="Select Apps"] .dialog-content > div:first-child) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.dialog-overlay[data-dialog="Select Apps"] .dialog-content > div:last-child) {
  flex-shrink: 0;
}

.app-picker-dialog__body {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
