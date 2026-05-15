<template>
  <section class="flex flex-col gap-6">
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
                    class="inline-flex cursor-pointer items-center gap-1.5"
                    @click.stop="onStatusClick(row.id, 'bench')"
                  >
                    {{ formatStatusLabel(row) }}
                    <span
                      v-if="isResourceBusy(row.id, 'bench')"
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
            class="flex min-h-[300px] flex-col items-center justify-center bg-white px-12 text-center"
          >
            <h2 class="m-0 text-lg font-semibold text-ink-gray-9">
              No benches found
            </h2>
            <p class="mt-2 mb-6 text-sm text-ink-gray-6">
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
              <div class="flex flex-col gap-4">
                <div class="flex items-center gap-2.5 px-0 py-1">
                  <span :class="['text-[0.95rem] leading-tight tracking-[-0.01em]', wizardStep === 1 ? 'font-medium text-ink-gray-9' : 'font-normal text-ink-gray-5']">
                    Details
                  </span>
                  <IconChevronRight class="size-[15px] shrink-0 text-ink-gray-5" />
                  <span :class="['text-[0.95rem] leading-tight tracking-[-0.01em]', wizardStep === 2 ? 'font-medium text-ink-gray-9' : 'font-normal text-ink-gray-5']">
                    Apps
                  </span>
                  <IconChevronRight class="size-[15px] shrink-0 text-ink-gray-5" />
                  <span :class="['text-[0.95rem] leading-tight tracking-[-0.01em]', wizardStep === 3 ? 'font-medium text-ink-gray-9' : 'font-normal text-ink-gray-5']">
                    Confirm
                  </span>
                </div>

                <form
                  class="flex flex-col gap-4"
                  @submit.prevent="onCreateBench"
                >
                  <p
                    v-if="wizardErrors.length > 0"
                    class="mb-4 text-sm text-ink-red-3"
                  >
                    {{ wizardErrors.join(' ') }}
                  </p>

                  <div
                    v-if="wizardStep === 1"
                    class="grid gap-4"
                  >
                    <label class="flex flex-col gap-1.5">
                      <FormLabel label="Name" />
                      <TextInput
                        v-model="createForm.name"
                        type="text"
                        required
                        placeholder="my-bench"
                        variant="outline"
                      />
                    </label>

                    <label class="flex flex-col gap-1.5">
                      <FormLabel label="Frappe Version" />
                      <FrappeVersionSelect
                        v-model="createForm.frappeVersion"
                        class="w-full"
                      />
                    </label>

                    <label class="flex flex-col gap-1.5">
                      <FormLabel label="Path" />
                      <div class="flex w-full gap-2">
                        <div class="flex-1 min-w-0">
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
                        >
                          Browse
                        </Button>
                      </div>
                    </label>
                  </div>

                  <div
                    v-if="wizardStep === 2"
                    class="grid gap-4"
                  >
                    <label class="flex flex-col gap-1.5">
                      <AppPicker
                        v-model="createForm.appsSelected"
                        class="w-full"
                        :disabled="creating || loading"
                        :frappe-version="createForm.frappeVersion"
                        :disable-core-bench-apps="true"
                      />
                    </label>
                  </div>

                  <div
                    v-if="wizardStep === 3"
                    class="flex flex-col gap-2 p-4 rounded bg-surface-gray-2"
                  >
                    <div class="mb-2 flex justify-between text-[13px]">
                      <span>Name</span><strong class="font-semibold">{{ createForm.name }}</strong>
                    </div>
                    <div class="mb-2 flex justify-between text-[13px]">
                      <span>Frappe Version</span><strong class="font-semibold">{{ createForm.frappeVersion }}</strong>
                    </div>
                    <div class="mb-2 flex justify-between text-[13px]">
                      <span>Path</span><strong class="font-mono text-xs font-semibold break-all">{{ createForm.path }}</strong>
                    </div>
                    <div class="flex justify-between text-[13px]">
                      <span>Apps</span><strong class="font-semibold">{{ createForm.appsSelected.length > 0 ? `${CORE_BENCH_APPS_LABEL}, ${createForm.appsSelected.join(', ')}` : CORE_BENCH_APPS_LABEL }}</strong>
                    </div>
                  </div>
                </form>
              </div>
            </template>

            <template #actions>
              <div class="flex justify-end gap-3">
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
              <div class="flex flex-col h-full min-h-0 overflow-hidden">
                <AppPicker
                  v-model="createForm.appsSelected"
                  :disabled="creating || loading"
                  :frappe-version="createForm.frappeVersion"
                  :disable-core-bench-apps="true"
                />
              </div>
            </template>
            <template #actions>
              <div class="flex justify-end gap-3">
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
              <div class="flex justify-end gap-3">
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
            :options="{ title: `Manage Apps in ${selectedBenchForApps?.name || 'Bench'}`, size: '4xl' }"
            @close="closeAppsDialog"
          >
            <template #body-content>
              <div class="flex flex-col gap-4">
                <Tabs
                  v-model="selectedBenchAppsTabIndex"
                  as="div"
                  class="max-h-[65vh] min-h-0"
                  :tabs="benchAppsTabs"
                >
                  <template #tab-panel="{ tab }">
                    <div
                      v-if="tab.label === 'Installed apps'"
                      class="flex flex-col min-h-0 gap-3 pt-6"
                    >
                      <div
                        v-if="installedAppRows.length === 0"
                        class="py-8 text-center text-ink-gray-5"
                      >
                        No apps installed.
                      </div>

                      <ListView
                        v-else
                        :columns="installedAppColumns"
                        :rows="installedAppRows"
                        row-key="id"
                        :options="installedAppsListOptions"
                      >
                        <template #cell="{ column, row }">
                          <template v-if="column.key === 'app'">
                            <div class="flex items-start min-w-0 gap-3 py-3">
                              <img
                                v-if="row.icon"
                                :src="row.icon"
                                class="rounded-md size-8"
                              >
                              <div
                                v-else
                                class="flex items-center justify-center font-bold rounded size-8 shrink-0 bg-surface-gray-3 text-ink-gray-5"
                              >
                                {{ row.appName.charAt(0).toUpperCase() }}
                              </div>
                              <div class="min-w-0">
                                <div class="font-medium text-ink-gray-9">
                                  {{ row.appName }}
                                </div>
                                <div class="text-xs text-ink-gray-5">
                                  {{ row.description }}
                                </div>
                              </div>
                            </div>
                          </template>

                          <template v-else-if="column.key === 'version'">
                            <div class="py-3 text-sm text-ink-gray-6">
                              <Badge
                                variant="subtle"
                                :theme="row.isCore ? 'gray' : 'blue'"
                              >
                                {{ row.isCore ? 'Core app' : row.version }}
                              </Badge>
                            </div>
                          </template>

                          <template v-else-if="column.key === 'actions'">
                            <div class="flex justify-end py-3">
                              <Button
                                v-if="row.removable"
                                size="sm"
                                variant="subtle"
                                theme="red"
                                :disabled="!canMutateApps || updating"
                                :loading="updating && pendingRemoveBenchAppId === row.appId"
                                @click.stop="onRequestRemoveBenchApp(row.appId)"
                              >
                                Remove
                              </Button>
                              <span
                                v-else
                                class="text-xs text-ink-gray-5"
                              >
                                Preinstalled
                              </span>
                            </div>
                          </template>
                        </template>
                      </ListView>
                    </div>

                    <div
                      v-else
                      class="flex flex-col min-h-0 gap-3 pt-6"
                    >
                      <AppPicker
                        v-model="appsToInstall"
                        :disabled="!canMutateApps || updating"
                        :frappe-version="selectedBenchForApps?.frappeVersion"
                        :disable-core-bench-apps="true"
                        :exclude-app-ids="selectedBenchForApps?.apps ?? []"
                      />

                      <p class="mt-2 text-xs text-ink-gray-5">
                        Only apps that are not already installed are shown here.
                      </p>
                    </div>
                  </template>
                </Tabs>

                <p
                  v-if="selectedBenchForApps && selectedBenchForApps.status !== 'running'"
                  class="text-sm text-ink-amber-4"
                >
                  Start the bench before installing or removing apps.
                </p>
              </div>
            </template>
            <template #actions>
              <div class="flex justify-end gap-3">
                <Button
                  size="md"
                  variant="solid"
                  @click="closeAppsDialog"
                >
                  Close
                </Button>
                <Button
                  v-if="selectedBenchAppsTab === 'install'"
                  size="md"
                  variant="solid"
                  :loading="updating"
                  :disabled="!canMutateApps || updating || appsToInstall.length === 0"
                  @click="onInstallSelectedApps"
                >
                  Install selected apps
                </Button>
              </div>
            </template>
          </Dialog>

          <ConfirmationDialog
            :open="removeAppConfirmOpen"
            title="Remove app"
            :message="removeAppConfirmMessage"
            confirm-label="Remove app"
            @cancel="onCancelRemoveBenchApp"
            @confirm="onConfirmRemoveBenchApp"
          />
        </section>
      </template>

  <script setup lang="ts">
  import { computed, onBeforeUnmount, reactive, ref, watch, watchEffect, type Component } from 'vue';
  import { useRouter } from 'vue-router';
  import { Badge, Button, Dialog, Dropdown, FormLabel, ListView, Tabs, TextInput, toast } from 'frappe-ui';
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
import { toSelectorFrappeVersion } from '../frappe-version';
import type { BenchListItem, CatalogAppItem } from '../../shared/ipc';
import { CORE_BENCH_APPS_LABEL, CORE_BENCH_APPS_SET } from '../../shared/bench-apps';
import { normalizeSelection } from '../app-picker-state';
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
const selectedBenchForAppsId = ref<string | null>(null);
const selectedBenchAppsTab = ref<'installed' | 'install'>('installed');
const benchAppsTabs = [
  { label: 'Installed apps' },
  { label: 'Install apps' },
];
const selectedBenchAppsTabIndex = computed({
  get: () => (selectedBenchAppsTab.value === 'installed' ? 0 : 1),
  set: (value: string | number) => {
    const normalizedValue = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    selectedBenchAppsTab.value = normalizedValue === 0 ? 'installed' : 'install';
  },
});
const appsToInstall = ref<string[]>([]);
const removeAppConfirmOpen = ref(false);
const pendingRemoveBenchAppId = ref<string | null>(null);
const pendingRemoveBenchAppName = ref('');

const selectedBenchForApps = computed(
  () => benches.value.find((bench) => bench.id === selectedBenchForAppsId.value) ?? null,
);

const onShowApps = (bench: BenchListItem) => {
  selectedBenchForAppsId.value = bench.id;
  selectedBenchAppsTab.value = 'installed';
  appsToInstall.value = [];
  removeAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;
  pendingRemoveBenchAppName.value = '';
  showAppsDialog.value = true;
};

const closeAppsDialog = () => {
  showAppsDialog.value = false;
  selectedBenchForAppsId.value = null;
  selectedBenchAppsTab.value = 'installed';
  appsToInstall.value = [];
  removeAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;
  pendingRemoveBenchAppName.value = '';
};

const canMutateApps = computed(() => selectedBenchForApps.value?.status === 'running');

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

const installedAppRows = computed(() => {
  const benchApps = selectedBenchForApps.value?.apps ?? [];

  return benchApps.map((appId) => {
    const appInfo = getAppInfo(appId);
    const isCore = CORE_BENCH_APPS_SET.has(appId);

    return {
      id: appId,
      appId,
      appName: appInfo.name,
      description: appInfo.description,
      icon: appInfo.icon,
      version: appInfo.version,
      isCore,
      removable: !isCore,
    };
  });
});

const installedAppColumns = reactive([
  { label: 'App', key: 'app', width: 2.2 },
  { label: 'Version', key: 'version', width: 0.8 },
  { label: '', key: 'actions', width: 0.7 },
]);

const installedAppsListOptions = {
  selectable: false,
  showTooltip: false,
  resizeColumn: true,
  rowHeight: '72px',
};

const queueBenchAppsUpdate = async (nextApps: readonly string[]) => {
  const bench = selectedBenchForApps.value;
  if (!bench) {
    return;
  }

  const normalizedNextApps = normalizeSelection(nextApps);
  const currentApps = normalizeSelection(bench.apps);
  const sameApps = normalizedNextApps.length === currentApps.length && normalizedNextApps.every((appId, index) => appId === currentApps[index]);
  if (sameApps) {
    return;
  }

  await update(bench.id, { apps: normalizedNextApps });
};

const onInstallSelectedApps = async () => {
  const bench = selectedBenchForApps.value;
  if (!bench || !canMutateApps.value || appsToInstall.value.length === 0) {
    return;
  }

  const nextApps = normalizeSelection([...bench.apps, ...appsToInstall.value]);
  toast.success(`Installing apps to bench ${bench.name}...`);
  await queueBenchAppsUpdate(nextApps);
  closeAppsDialog();
  appsToInstall.value = [];
};

const onRequestRemoveBenchApp = (appId: string) => {
  const bench = selectedBenchForApps.value;
  if (!bench || !canMutateApps.value) {
    return;
  }

  const appInfo = getAppInfo(appId);
  pendingRemoveBenchAppId.value = appId;
  pendingRemoveBenchAppName.value = appInfo.name;
  removeAppConfirmOpen.value = true;
};

const onCancelRemoveBenchApp = () => {
  removeAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;
  pendingRemoveBenchAppName.value = '';
};

const removeAppConfirmMessage = computed(() => {
  const bench = selectedBenchForApps.value;
  if (!bench) {
    return 'Remove this app from the bench?';
  }

  return `Remove ${pendingRemoveBenchAppName.value} from bench "${bench.name}"? This will update the bench app list and remove the app from the bench.`;
});

const onConfirmRemoveBenchApp = async () => {
  const bench = selectedBenchForApps.value;
  const appId = pendingRemoveBenchAppId.value;
  if (!bench || !appId || !canMutateApps.value) {
    onCancelRemoveBenchApp();
    return;
  }

  removeAppConfirmOpen.value = false;
  pendingRemoveBenchAppId.value = null;

  const nextApps = bench.apps.filter((existingAppId) => existingAppId !== appId);
  toast.success(`Removing app from bench ${bench.name}...`);
  await queueBenchAppsUpdate(nextApps);
  pendingRemoveBenchAppName.value = '';
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
  const failedAppTask = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'bench' && t.status === 'failure' && t.taskName.toLowerCase().includes('update bench apps')
  );
  if (failedAppTask) return String(failedAppTask.message ?? '').toLowerCase().includes('cancelled') ? 'gray' : 'red';
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
const acknowledgedBenchAppTaskResults = ref(new Set<string>());

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null;
  return tasks.value.find(t => t.taskId === selectedTaskId.value) || null;
});


const formatStatusLabel = (row: BenchListItem) => {
  const pendingAction = getPendingBenchAction(row.id);
  if (pendingAction === 'starting') return 'Starting';
  if (pendingAction === 'restarting') return 'Restarting';
  if (pendingAction === 'stopping') return 'Stopping';

  const failedAppTask = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'bench' && t.status === 'failure' && t.taskName.toLowerCase().includes('update bench apps')
  );

  if (failedAppTask) {
    const failureMessage = String(failedAppTask.message ?? '').toLowerCase();
    if (failureMessage.includes('cancelled')) return 'Install cancelled';
    if (failureMessage.includes('timed out')) return 'Install timed out';
    return 'Install failed';
  }

  const task = (tasks.value || []).find(
    (t) => t.resourceId === row.id && t.resource === 'bench' && (t.status === 'running' || t.status === 'queued')
  );

  if (task) {
    const name = String(task.taskName ?? '').toLowerCase();
    if (name.includes('create bench')) return 'Creating';
    if (name.includes('update bench apps')) {
      const stepName = String(task.stepName ?? '').toLowerCase();
      if (stepName.includes('install')) return 'Installing';
      if (stepName.includes('remov')) return 'Removing apps';
      return 'Installing';
    }
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
  const isBenchAppsTask = (taskName: string) => taskName.toLowerCase().includes('update bench apps');

  const activeBenchAppsTask = resource === 'bench'
    ? tasks.value.find(
      (t) => t.resourceId === resourceId && t.resource === resource && isBenchAppsTask(t.taskName) && (t.status === 'running' || t.status === 'queued')
    )
    : null;

  if (activeBenchAppsTask) {
    selectedTaskId.value = activeBenchAppsTask.taskId;
    return;
  }

  const activeTask = tasks.value.find(
    (t) => t.resourceId === resourceId && t.resource === resource && (t.status === 'running' || t.status === 'queued')
  );

  if (activeTask) {
    selectedTaskId.value = activeTask.taskId;
    return;
  }

  const completedBenchAppsTask = resource === 'bench'
    ? tasks.value.find(
      (t) => t.resourceId === resourceId && t.resource === resource && isBenchAppsTask(t.taskName) && (t.status === 'success' || t.status === 'failure')
    )
    : null;

  if (completedBenchAppsTask) {
    selectedTaskId.value = completedBenchAppsTask.taskId;
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

      if (
        task.resource === 'bench' &&
        task.taskName.toLowerCase().includes('update bench apps') &&
        (task.status === 'success' || task.status === 'failure') &&
        !acknowledgedBenchAppTaskResults.value.has(task.taskId)
      ) {
        acknowledgedBenchAppTaskResults.value.add(task.taskId);
        const benchName = benches.value.find((bench) => bench.id === task.resourceId)?.name
          ?? task.taskName.replace(/^Update Bench Apps\s+/i, '').trim();

        void refresh(true);

        if (task.status === 'success') {
          toast.success(`Bench apps updated for ${benchName}.`);
        } else {
          toast.error(`App update failed for ${benchName}. Check progress logs.`);
          selectedTaskId.value = task.taskId;
        }
      }
    }
  },
  { deep: true }
);

const { form: settingsForm } = useSettings();
const getDefaultFrappeVersion = () => toSelectorFrappeVersion(settingsForm.value.defaultFrappeVersion);

const createForm = reactive({
  name: '',
  path: '',
  frappeVersion: getDefaultFrappeVersion(),
  appsSelected: [] as string[],
});
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

watch(
  () => settingsForm.value.defaultFrappeVersion,
  (nextValue, previousValue) => {
    const nextDefault = toSelectorFrappeVersion(nextValue);
    const previousDefault = toSelectorFrappeVersion(previousValue);

    if (!createForm.frappeVersion || createForm.frappeVersion === previousDefault) {
      createForm.frappeVersion = nextDefault;
    }
  }
);

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
  
  toast.success(`Creating bench ${result.payload.name}...`);
  await create(result.payload);

  createForm.name = '';
  createForm.path = '';
  createForm.frappeVersion = getDefaultFrappeVersion();
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
  createForm.frappeVersion = getDefaultFrappeVersion();
  createForm.appsSelected = [];
};

const onStopBench = async (id: string) => {
  await onSetBenchStatus(id, 'stopped');
};

const onSetBenchStatus = async (id: string, status: 'running' | 'stopped', currentStatus?: string) => {
  const bench = benches.value.find(b => b.id === id);
  const name = bench ? bench.name : '';
  
  if (status === 'running') {
    if (currentStatus === 'running') {
      toast.success(`Restarting bench ${name}...`);
    } else {
      toast.success(`Starting bench ${name}...`);
    }
    setPendingBenchAction(id, currentStatus === 'running' ? 'restarting' : 'starting');
  } else {
    toast.success(`Stopping bench ${name}...`);
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
  const name = pendingDeleteBenchName.value;
  if (!id) {
    onCancelDelete();
    return;
  }

  deleteConfirmOpen.value = false;
  toast.success(`Deleting bench ${name}...`);
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
:deep(.frappe-list-cell) {
  min-width: 0 !important;
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
</style>
