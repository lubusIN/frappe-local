<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base text-ink-gray-9">
    <PageHeaderBase class="z-10 flex h-12 border-b border-outline-gray-1 bg-surface-base shrink-0 [-webkit-app-region:drag]">
      <!-- List half -->
      <div
        v-show="showList"
        class="flex w-80 sm:w-96 shrink-0 items-center justify-between border-r border-outline-gray-1 px-4"
      >
        <PageHeaderTitle title="Benches" />
        <div class="flex items-center gap-1 [-webkit-app-region:no-drag]">
          <Button
            size="sm"
            variant="solid"
            :icon-left="IconPlus"
            label="Create"
            :disabled="loading"
            @click="showCreateBenchModal = true"
          />
        </div>
      </div>

      <!-- Reading / Detail half -->
      <div class="flex min-w-0 flex-1 items-center justify-between gap-3 px-5">
        <div class="flex min-w-0 items-center gap-2 [-webkit-app-region:no-drag]">
          <Button
            variant="ghost"
            :icon="showList ? IconPanelLeftClose : IconPanelLeft"
            label="Toggle list"
            @click="showList = !showList"
          />
          <PageHeaderTitle v-if="selectedBench">
            {{ selectedBench.name }}
          </PageHeaderTitle>
          <PageHeaderTitle v-else>
            Bench Details
          </PageHeaderTitle>
          <Badge
            v-if="selectedBench"
            variant="subtle"
            :theme="getStatusTheme(selectedBench)"
            class="shrink-0 flex items-center gap-1.5 !text-xs"
          >
            <span>{{ formatStatusLabel(selectedBench) }}</span>
            <Spinner
              v-if="isResourceBusy(selectedBench.id)"
              size="xs"
              class="text-current"
            />
          </Badge>
        </div>

        <!-- Bench actions -->
        <div
          v-if="selectedBench"
          class="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
        >
          <Button
            v-if="selectedBench.status !== 'running'"
            variant="ghost"
            :icon="IconPlay"
            tooltip="Start Bench"
            :disabled="updating || isResourceBusy(selectedBench.id) || selectedBench.status === 'queued'"
            @click="onSetBenchStatus(selectedBench.id, 'running', selectedBench.status)"
          />
          <Button
            v-else
            variant="ghost"
            :icon="IconRotateCw"
            tooltip="Restart Bench"
            :disabled="updating || isResourceBusy(selectedBench.id)"
            @click="onSetBenchStatus(selectedBench.id, 'running', selectedBench.status)"
          />
          <Button
            variant="ghost"
            :icon="IconSquare"
            tooltip="Stop Bench"
            :disabled="updating || selectedBench.status === 'stopped' || selectedBench.status === 'queued' || isResourceBusy(selectedBench.id)"
            @click="onStopBench(selectedBench.id)"
          />
          <Button
            variant="ghost"
            :icon="IconFolderOpen"
            tooltip="Open Bench Folder"
            :disabled="openingFolder"
            @click="onOpenBenchFolder(selectedBench.id)"
          />
          <Button
            variant="ghost"
            :icon="IconTerminal"
            tooltip="Open Shell"
            :disabled="selectedBench.status !== 'running'"
            @click="onOpenBenchShell(selectedBench.id)"
          />
          <Button
            variant="ghost"
            :icon="IconActivity"
            tooltip="Task Logs"
            @click="onStatusClick(selectedBench.id)"
          />
          <Dropdown
            :options="getBenchMoreActions(selectedBench)"
            align="end"
          >
            <Button
              variant="ghost"
              :icon="IconMoreHorizontal"
              tooltip="More Actions"
            />
          </Dropdown>
        </div>
      </div>
    </PageHeaderBase>

    <!-- PANE CONTAINER BELOW HEADER -->
    <div class="flex min-h-0 flex-1 w-full overflow-hidden">
      <!-- Bench list pane (Master) -->
      <section
        v-show="showList"
        class="flex h-full min-h-0 w-80 sm:w-96 shrink-0 flex-col border-r border-outline-gray-1 bg-surface-base"
      >
        <!-- Search & Status Filter Bar pinned above list -->
        <div
          v-if="!error && benches.length > 0"
          class="flex flex-col gap-2 shrink-0 border-b border-outline-gray-1 px-4 py-2.5 bg-surface-base"
        >
          <FormControl
            v-model="benchFilters.search"
            type="text"
            placeholder="Search benches..."
            size="sm"
            variant="outline"
          >
            <template #prefix>
              <IconSearch class="w-4 text-ink-gray-5" />
            </template>
          </FormControl>

          <div class="flex items-center justify-between gap-2 w-full mt-0.5 min-w-0">
            <TabButtons
              v-model="benchFilters.status"
              :options="statusTabOptions"
              class="justify-start overflow-x-auto no-scrollbar min-w-0"
            />
            <span class="text-sm text-ink-gray-5">
              {{ currentStatusCount }} benches
            </span>
          </div>
        </div>

        <ScrollArea
          class="min-h-0 flex-1"
          viewport-class="p-1"
        >
          <StatePanel
            v-if="error"
            kind="error"
            title="Unable to load benches"
            :body="error"
            action-label="Retry"
            @action="refresh"
          />

          <StatePanel
            v-else-if="loading && benches.length === 0"
            kind="loading"
            title="Loading benches"
            body="Fetching benches and lifecycle metadata."
          />

          <div
            v-else-if="benches.length === 0"
            class="p-3"
          >
            <EmptyState
              title="No benches yet"
              description="Create your first bench to get started with Frappe applications and sites."
              :icon="IconPackage"
            >
              <div class="mt-4">
                <Button
                  size="sm"
                  variant="solid"
                  @click="showCreateBenchModal = true"
                >
                  Create bench
                </Button>
              </div>
            </EmptyState>
          </div>

          <div
            v-else-if="filteredBenches.length === 0"
            class="p-3"
          >
            <EmptyState
              title="No matching benches"
              description="No benches match the current status or search filters."
              :icon="IconSearch"
            >
              <Button
                size="sm"
                variant="subtle"
                class="mt-2"
                @click="clearBenchFilters"
              >
                Clear filters
              </Button>
            </EmptyState>
          </div>

          <template v-else>
            <List
              v-model:active="selectedBenchId"
              :columns="['minmax(0,1fr)', 'auto']"
              :style="{ '--list-row-padding-x': '1rem' }"
            >
              <ListRows
                v-slot="{ item: bench, value }"
                :items="filteredBenches"
                row-key="id"
              >
                <ListRow
                  :value="value"
                  @click="selectBench(bench.id)"
                >
                  <ListCell>
                    <div class="min-w-0 py-3">
                      <div
                        class="truncate inline-flex items-center text-sm text-ink-gray-8"
                        :class="selectedBenchId === bench.id && 'font-semibold text-ink-gray-9'"
                      >
                        <span
                          class="mr-2 inline-block size-2 rounded-full align-middle shrink-0"
                          :class="bench.status === 'running' ? 'bg-surface-green-7' : (bench.status === 'stopped' || bench.status === 'success') ? 'bg-surface-gray-5' : bench.status === 'queued' ? 'bg-surface-yellow-7 animate-pulse' : 'bg-surface-red-7'"
                        />
                        <span class="truncate">{{ bench.name }}</span>
                      </div>
                      <div
                        class="truncate text-xs text-ink-gray-5 mt-0.5 pl-4"
                        :title="bench.path"
                      >
                        {{ formatPath(bench.path) }}
                      </div>
                    </div>
                  </ListCell>
                  <ListCell class="self-start justify-end pt-3.5">
                    <div class="flex items-center gap-1.5 shrink-0">
                      <Spinner
                        v-if="isResourceBusy(bench.id)"
                        size="xs"
                        class="text-ink-gray-6"
                      />
                      <span
                        v-else-if="bench.frappeVersion"
                        class="text-xs font-mono text-ink-gray-5"
                      >
                        {{ bench.frappeVersion }}
                      </span>
                    </div>
                  </ListCell>
                </ListRow>
              </ListRows>
            </List>
          </template>
        </ScrollArea>
      </section>

      <!-- Reading / Detail Pane -->
      <section class="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface-base">
        <div
          v-if="!selectedBench"
          class="flex-1 flex items-center justify-center p-8 text-ink-gray-5 text-sm"
        >
          Select a bench from the list to inspect details, actions, and apps.
        </div>

        <template v-else>
          <ScrollArea class="min-h-0 flex-1">
            <div class="space-y-6 px-6 py-5 w-full">
              <!-- APPS Section -->
              <div class="flex flex-col gap-4">
                <div class="flex items-center justify-between border-b border-outline-gray-1 pb-3">
                  <div class="flex items-center gap-2">
                    <h3 class="text-base-semibold text-ink-gray-9">
                      Apps
                    </h3>
                  </div>
                </div>

                <div
                  v-if="benchAppsWarningMessage"
                  class="pt-2"
                >
                  <Alert 
                    theme="yellow" 
                    :title="benchAppsWarningMessage" 
                    :dismissible="false" 
                  />
                </div>

                <AppManager
                  class="pt-1 w-full"
                  container-class="flex flex-col gap-1 w-full"
                  :resource-id="selectedBench.id"
                  :resource-name="selectedBench.name"
                  :bench-status="selectedBench.status"
                  context="bench"
                  :active-app-ids="selectedBench.apps || []"
                  :disabled="!canMutateApps || updating"
                  :frappe-version="selectedBench.frappeVersion"
                  :loading-app-id="updating ? pendingRemoveBenchAppId || 'adding' : null"
                  @add-app="onAddBenchApp"
                  @remove-app="onRequestRemoveBenchApp"
                  @install-app="onAddBenchApp"
                  @uninstall-app="onRequestRemoveBenchApp"
                />
              </div>
            </div>
          </ScrollArea>

          <!-- Footer Actions Bar pinned at bottom of reading pane -->
          <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-outline-gray-1 px-5 py-3 bg-surface-base">
            <div class="flex items-center gap-2">
              <Button
                variant="subtle"
                size="sm"
                :icon-left="IconGlobe"
                @click="onManageBenchSites(selectedBench.id)"
              >
                Go to Sites ({{ getBenchSiteCount(selectedBench.id) }})
              </Button>
              <Button
                variant="subtle"
                size="sm"
                :icon-left="IconPlus"
                @click="showCreateSiteModal = true"
              >
                Add Site
              </Button>
            </div>
          </footer>
        </template>
      </section>
    </div>

    <!-- Modals -->
    <ConfirmationDialog
      :open="confirmDeleteBenchOpen"
      title="Delete Bench"
      :message="`Are you sure you want to delete bench &quot;${deleteBenchName}&quot;? This cannot be undone.`"
      confirm-label="Delete"
      @cancel="cancelDeleteBench"
      @confirm="onConfirmDeleteBench"
    />

    <BenchWizardDialog
      v-model:open="showCreateBenchModal"
      @created="onBenchCreated"
    />

    <SiteWizardDialog
      v-model:open="showCreateSiteModal"
      :fixed-bench-id="selectedBench?.id"
      @created="onSiteCreated"
    />

    <ConfirmationDialog
      :open="removeAppConfirmOpen"
      title="Remove app"
      :message="removeAppConfirmMessage"
      confirm-label="Remove app"
      @cancel="onCancelRemoveBenchApp"
      @confirm="onConfirmRemoveBenchApp"
    />

    <AppUsageDialog
      v-model:open="usageDialogOpen"
      :app-name="usageAppTitle"
      title="App in use"
      :usage="usageData"
    />
  </div>
</template>

<script setup lang="ts">
import { Alert, Badge, Button, Dropdown, PageHeaderBase, PageHeaderTitle, ScrollArea, Spinner, TabButtons, FormControl, toast } from 'frappe-ui';
import { List, ListCell, ListRow, ListRows } from 'frappe-ui/list';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import IconSearch from '~icons/lucide/search';
import IconActivity from '~icons/lucide/activity';
import IconRotateCw from '~icons/lucide/rotate-cw';
import IconPlay from '~icons/lucide/play';
import IconSquare from '~icons/lucide/square';
import IconFolderOpen from '~icons/lucide/folder-open';
import IconTerminal from '~icons/lucide/terminal';
import IconTrash2 from '~icons/lucide/trash2';
import IconPlus from '~icons/lucide/plus';
import IconCode from '~icons/lucide/code';
import IconBox from '~icons/lucide/box';
import IconHammer from '~icons/lucide/hammer';
import IconPanelLeftClose from '~icons/lucide/panel-left-close';
import IconPanelLeft from '~icons/lucide/panel-left';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import AppManager from '@frappe-local/renderer/components/AppManager.vue';
import { useConfirmAction } from '@frappe-local/renderer/composables/ui';
import { useProgressCenter, useResourceTaskState, runAndWaitForTask, useEditorStatus, useIpc } from '@frappe-local/renderer/composables/system';
import { useAppCatalog, useBenches, useSites } from '@frappe-local/renderer/composables/data';
import BenchWizardDialog from '@frappe-local/renderer/components/dialogs/BenchWizardDialog.vue';
import SiteWizardDialog from '@frappe-local/renderer/components/dialogs/SiteWizardDialog.vue';
import AppUsageDialog from '@frappe-local/renderer/components/dialogs/AppUsageDialog.vue';
import type { BenchListItem } from '@frappe-local/shared/core';

const { isEditorInstalled } = useEditorStatus();

const route = useRoute();
const router = useRouter();
const ipc = useIpc();

const {
  benches,
  loading,
  updating,
  deleting,
  openingFolder,
  error,
  successMessage,
  update,
  build,
  remove: deleteBench,
  checkAppUsage,
  openFolder,
  openShell,
  openInEditor,
  refresh,
} = useBenches();

const { sites, refresh: refreshSites } = useSites();

const showCreateSiteModal = ref(false);

const onSiteCreated = () => {
  refreshSites(true);
};

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

const { getAppInfo, getAppTitle } = useAppCatalog();
const removeAppConfirmOpen = ref(false);
const pendingRemoveBenchAppId = ref<string | null>(null);
const pendingRemoveBenchAppName = ref('');

const usageDialogOpen = ref(false);
const usageAppTitle = ref('');
const usageData = ref({ benches: [] as string[], sites: [] as string[] });

const selectedBenchId = ref<string>();
const showList = ref(true);

const selectBench = (id: string) => {
  selectedBenchId.value = id;
};

const formatPath = (path: string) => {
  if (!path) return '';
  return path.replace(/^\/Users\/[^/]+/, '~');
};

const benchFilters = reactive({
  status: '',
  search: '',
});

const statusTabs = computed(() => [
  { label: 'All', value: '', count: benches.value.length },
  { label: 'Running', value: 'running', count: benches.value.filter((b) => b.status === 'running').length },
  { label: 'Stopped', value: 'stopped', count: benches.value.filter((b) => b.status === 'stopped' || b.status === 'success').length },
  { label: 'Error', value: 'failure', count: benches.value.filter((b) => b.status === 'failure').length },
]);

const statusTabOptions = computed(() =>
  statusTabs.value.map((tab) => ({
    label: tab.label,
    value: tab.value,
  }))
);

const currentStatusCount = computed(() => {
  const currentTab = statusTabs.value.find((t) => t.value === benchFilters.status);
  return currentTab ? currentTab.count : benches.value.length;
});

const filteredBenches = computed(() => {
  return benches.value.filter((bench) => {
    if (benchFilters.status) {
      if (benchFilters.status === 'running' && bench.status !== 'running') return false;
      if (benchFilters.status === 'stopped' && bench.status !== 'stopped' && bench.status !== 'success') return false;
      if (benchFilters.status === 'failure' && bench.status !== 'failure') return false;
    }
    if (benchFilters.search) {
      const q = benchFilters.search.toLowerCase();
      return bench.name.toLowerCase().includes(q) || bench.path.toLowerCase().includes(q) || (bench.frappeVersion || '').toLowerCase().includes(q);
    }
    return true;
  });
});

const clearBenchFilters = () => {
  benchFilters.status = '';
  benchFilters.search = '';
};

const selectedBench = computed(() => {
  if (selectedBenchId.value) {
    const found = benches.value.find((b) => b.id === selectedBenchId.value);
    if (found) return found;
  }
  return filteredBenches.value[0] ?? benches.value[0] ?? null;
});

watch(
  () => filteredBenches.value,
  (list) => {
    if (list.length > 0 && (!selectedBenchId.value || !benches.value.some((b) => b.id === selectedBenchId.value))) {
      selectedBenchId.value = list[0]?.id;
    }
  },
  { immediate: true }
);

watch(
  () => route.query.benchId,
  (benchId) => {
    if (typeof benchId === 'string' && benchId && benches.value.some((b) => b.id === benchId)) {
      selectedBenchId.value = benchId;
    }
  },
  { immediate: true }
);

const selectedBenchForApps = computed(() => selectedBench.value);

const benchAppsWarningMessage = computed(() => {
  const bench = selectedBenchForApps.value;
  if (!bench) return null;
  if (bench.status !== 'running') return 'Start the bench before managing apps.';
  if (isResourceBusy(bench.id)) return 'App orchestration is currently in progress. Please wait.';
  return null;
});

const canMutateApps = computed(() => benchAppsWarningMessage.value === null);

const normalizeSelection = (selectedIds: readonly string[]): string[] =>
  Array.from(new Set(selectedIds.map((id) => id.trim()).filter(Boolean)));

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

const onAddBenchApp = async (appId: string) => {
  const bench = selectedBenchForApps.value;
  if (!bench || !canMutateApps.value) {
    return;
  }

  const nextApps = normalizeSelection([...bench.apps, appId]);

  const promise = runAndWaitForTask(
    () => queueBenchAppsUpdate(nextApps),
    'bench', bench.id, /^(Get) app .* on /i
  ).then(async (res) => {
    await refresh(true);
    return res;
  });

  const appTitle = getAppTitle(appId);
  toast.promise(promise, {
    loading: `Getting app ${appTitle} for bench ${bench.name}`,
    success: `Got app ${appTitle} on bench ${bench.name}`,
    error: `Failed to get app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(bench.id);
      },
    },
  });
};

const onRequestRemoveBenchApp = async (appId: string) => {
  const bench = selectedBenchForApps.value;
  if (!bench || !canMutateApps.value) {
    return;
  }

  const appTitle = getAppTitle(appId) || appId;

  const info = getAppInfo(appId);
  
  const identifiers = [appId];
  if (info.id && !identifiers.includes(info.id)) identifiers.push(info.id);
  if (info.name && !identifiers.includes(info.name)) identifiers.push(info.name);
  if (info.title && !identifiers.includes(info.title)) identifiers.push(info.title);

  try {
    const usage = await checkAppUsage(bench.id, identifiers);
    if (usage.inUse) {
      usageAppTitle.value = appTitle;
      usageData.value = { benches: usage.benches, sites: usage.sites };
      usageDialogOpen.value = true;
      return;
    }

    pendingRemoveBenchAppId.value = appId;
    pendingRemoveBenchAppName.value = appTitle;
    removeAppConfirmOpen.value = true;
  } catch {
    toast.error('Failed to check app usage');
  }
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
  
  const appTitle = pendingRemoveBenchAppName.value || appId;

  removeAppConfirmOpen.value = false;

  const info = getAppInfo(appId);

  const nextApps = bench.apps.filter((existingAppId) => existingAppId !== appId && existingAppId !== info.id && existingAppId !== info.name);

  const promise = runAndWaitForTask(
    () => queueBenchAppsUpdate(nextApps),
    'bench', bench.id, /^(Remove) app .* on /i
  ).then(async (res) => {
    await refresh(true);
    return res;
  });

  toast.promise(promise, {
    loading: `Removing app ${appTitle} from bench ${bench.name}`,
    success: `Removed app ${appTitle} from bench ${bench.name}`,
    error: `Failed to remove app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(bench.id);
      },
    },
  });
};

const onManageBenchSites = (id: string) => {
  router.push({ name: 'sites', query: { benchId: id } });
};

const getBenchSiteCount = (benchId: string) => {
  return sites.value.filter((s) => s.benchId === benchId).length;
};

const { tasks, activeLogTaskId: selectedTaskId } = useProgressCenter();

const {
  setPendingAction: setPendingBenchAction,
  clearPendingAction: clearPendingBenchAction,
  isResourceBusy,
  formatStatusLabel,
  getStatusTheme,
  getLatestRelevantTaskId,
} = useResourceTaskState('bench', computed(() => tasks.value || []));

const {
  isOpen: confirmDeleteBenchOpen,
  pendingId: deleteBenchId,
  pendingName: deleteBenchName,
  open: confirmDeleteBench,
  cancel: cancelDeleteBench,
} = useConfirmAction();

const getBenchMoreActions = (bench: BenchListItem) => {
  const actions = [
    {
      group: 'Development',
      options: [
        {
          label: 'VS Code',
          icon: IconCode,
          disabled: !isEditorInstalled.value,
          onClick: () => openInEditor(bench.id, false),
        },
        {
          label: 'Dev Container',
          icon: IconBox,
          disabled: !isEditorInstalled.value || bench.status !== 'running',
          onClick: () => openInEditor(bench.id, true),
        },
      ],
    },
    {
      group: 'Manage',
      options: [
        {
          label: 'Build',
          icon: IconHammer,
          disabled: updating.value || deleting.value || bench.status !== 'running' || isResourceBusy(bench.id),
          onClick: () => onBuildBench(bench.id),
        },
        {
          label: 'Delete',
          icon: IconTrash2,
          theme: 'red' as const,
          disabled: updating.value || deleting.value || bench.status === 'running' || isResourceBusy(bench.id),
          onClick: () => confirmDeleteBench(bench.id, bench.name),
        },
      ],
    },
  ];
  return actions;
};

const onStatusClick = (resourceId: string) => {
  selectedTaskId.value = getLatestRelevantTaskId(resourceId);
};

const showCreateBenchModal = ref(false);

const onStopBench = async (id: string) => {
  await onSetBenchStatus(id, 'stopped');
};

const onBuildBench = async (id: string) => {
  const bench = benches.value.find((b) => b.id === id);
  const name = bench ? bench.name : '';

  const promise = runAndWaitForTask(
    () => build(id),
    'bench',
    id,
    /^Build bench/i
  ).then(() => refresh(true));

  toast.promise(promise, {
    loading: `Building bench ${name}...`,
    success: `Bench ${name} build complete.`,
    error: `Failed to build bench ${name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(id);
      }
    },
  });
};

const onSetBenchStatus = async (id: string, status: 'running' | 'stopped', currentStatus?: string) => {
  const bench = benches.value.find(b => b.id === id);
  const name = bench ? bench.name : '';

  let loadingMsg = '';
  let successMsg = '';
  let errorMsg = '';
  let actionMatch: RegExp;

  if (status === 'running') {
    if (currentStatus === 'running') {
      loadingMsg = `Restarting bench ${name}`;
      successMsg = `Bench ${name} restarted.`;
      errorMsg = `Failed to restart bench ${name}.`;
      actionMatch = /^Restart bench/i;
      setPendingBenchAction(id, 'restarting');
    } else {
      loadingMsg = `Starting bench ${name}`;
      successMsg = `Bench ${name} started.`;
      errorMsg = `Failed to start bench ${name}.`;
      actionMatch = /^Start bench/i;
      setPendingBenchAction(id, 'starting');
    }
  } else {
    loadingMsg = `Stopping bench ${name}`;
    successMsg = `Bench ${name} stopped.`;
    errorMsg = `Failed to stop bench ${name}.`;
    actionMatch = /^Stop bench/i;
    setPendingBenchAction(id, 'stopping');
  }

  const promise = runAndWaitForTask(
    () => update(id, { status }),
    'bench', id, actionMatch
  );
  toast.promise(promise, {
    loading: loadingMsg,
    success: successMsg,
    error: errorMsg,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(id);
      }
    },
  });

  try {
    await promise;
  } catch {
    clearPendingBenchAction(id);
  }
};

const onConfirmDeleteBench = async () => {
  if (!deleteBenchId.value) return;
  const id = deleteBenchId.value;
  const name = deleteBenchName.value;
  cancelDeleteBench();
  try {
    const promise = runAndWaitForTask(
      () => deleteBench(id),
      'bench', id, /^Delete bench/i
    );
    toast.promise(promise, {
      loading: `Deleting bench ${name}`,
      success: `Bench ${name} deleted.`,
      error: `Failed to delete bench ${name}.`,
      action: {
        label: 'View logs',
        onClick: (e?: Event) => {
          e?.preventDefault();
          selectedTaskId.value = getLatestRelevantTaskId(id);
        }
      },
    });
    await promise;
    void refreshSites(true);
  } catch {
    // handled by toast
  }
};

const onOpenBenchFolder = async (id: string) => {
  await openFolder(id);
};

const onBenchCreated = async (bench: BenchListItem) => {
  void refresh(true);
  const benchPromise = runAndWaitForTask(() => Promise.resolve(), 'bench', bench.id, /^Create bench/i).then(() => refresh(true));
  toast.promise(benchPromise, {
    loading: `Creating bench ${bench.name}`,
    success: `Bench ${bench.name} created.`,
    error: `Failed to create bench ${bench.name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(bench.id);
      }
    }
  });

  benchPromise.then(async () => {
    await refreshSites(true);
    const initialSite = sites.value.find(s => s.benchId === bench.id && s.status === 'queued');
    if (initialSite) {
      const sitePromise = runAndWaitForTask(() => Promise.resolve(), 'site', initialSite.id, /^Create Site/i).then(() => refreshSites(true));
      toast.promise(sitePromise, {
        loading: `Creating initial site ${initialSite.name}`,
        action: {
          label: 'View logs',
          onClick: (e?: Event) => {
            e?.preventDefault();
            selectedTaskId.value = getLatestRelevantTaskId(bench.id);
          }
        },
        success: () => ({
          message: `Site ${initialSite.name} created.`,
          action: {
            label: 'Open',
            onClick: (e?: Event) => {
              e?.preventDefault();
              void ipc.openSiteExternal(initialSite.id).then((opened) => {
                if (!opened) {
                  toast.error(`Unable to open ${initialSite.name}.`);
                }
              });
            }
          }
        }),
        error: `Failed to create site ${initialSite.name}.`
      });
    }
  }).catch(() => {});
};

const onOpenBenchShell = async (id: string) => {
  await openShell(id);
};
</script>
