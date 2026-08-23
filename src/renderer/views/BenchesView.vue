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
            :icon-left="'lucide-plus'"
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
            :icon="showList ? 'lucide-panel-left-close' : 'lucide-panel-left'"
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
          <Dropdown
            :options="getBenchMoreActions(selectedBench)"
            align="end"
          >
            <Button
              variant="ghost"
              :icon="'lucide-more-horizontal'"
              tooltip="More Actions"
            />
          </Dropdown>
        </div>
      </div>
    </PageHeaderBase>

    <!-- PANE CONTAINER BELOW HEADER -->
    <div class="flex min-h-0 flex-1 w-full overflow-hidden">
      <!-- Bench list pane (Master) -->
      <BenchListPane
        v-show="showList"
        v-model="selectedBenchId"
        :benches="benches"
        :loading="loading"
        :error="error"
        :is-resource-busy="isResourceBusy"
        @select="selectBench"
        @refresh="refresh"
        @create="showCreateBenchModal = true"
      />

      <!-- Reading / Detail Pane -->
      <section class="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface-base">
        <div
          v-if="!selectedBench"
          class="flex-1 flex items-center justify-center p-8 text-ink-gray-5 text-sm"
        >
          Select a bench from the list to inspect details, actions, and apps.
        </div>

        <template v-else>
          <Tabs
            :tabs="[{ label: 'Overview', value: 'Overview' }, { label: 'Apps', value: 'Apps' }]"
            class="flex-1 min-h-0"
          >
            <template #tab-panel="{ tab }">
              <BenchOverviewTab
                v-if="tab.label === 'Overview'"
                :bench="selectedBench"
                :health="health"
                :updating="updating"
                :deleting="deleting"
                :opening-folder="openingFolder"
                :is-editor-installed="isEditorInstalled"
                :is-busy="isResourceBusy(selectedBench.id)"
                @start="onSetBenchStatus(selectedBench.id, 'running', selectedBench.status)"
                @restart="onSetBenchStatus(selectedBench.id, 'running', selectedBench.status)"
                @stop="onStopBench(selectedBench.id)"
                @build="onBuildBench(selectedBench.id)"
                @logs="onStatusClick(selectedBench.id)"
                @open-folder="onOpenBenchFolder(selectedBench.id)"
                @open-shell="onOpenBenchShell(selectedBench.id)"
                @open-editor="openInEditor(selectedBench.id, $event)"
                @remove-app="onRequestRemoveBenchApp"
              />

              <BenchAppsTab
                v-else-if="tab.label === 'Apps'"
                :bench="selectedBench"
                :warning-message="benchAppsWarningMessage"
                :can-mutate="canMutateApps"
                :updating="updating"
                :pending-remove-id="pendingRemoveBenchAppId"
                @add-app="onAddBenchApp"
                @remove-app="onRequestRemoveBenchApp"
              />
            </template>
          </Tabs>

          <!-- Footer Actions Bar -->
          <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-outline-gray-1 px-5 py-3 bg-surface-base">
            <div class="flex items-center gap-2">
              <Button
                variant="subtle"
                size="sm"
                :icon-left="'lucide-app-window'"
                @click="onManageBenchSites(selectedBench.id)"
              >
                Go to Sites ({{ getBenchSiteCount(selectedBench.id) }})
              </Button>
              <Button
                variant="subtle"
                size="sm"
                :icon-left="'lucide-plus'"
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
import { Badge, Button, Dropdown, PageHeaderBase, PageHeaderTitle, Tabs, Spinner, toast } from 'frappe-ui';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import BenchListPane from '@frappe-local/renderer/components/benches/BenchListPane.vue';
import BenchOverviewTab from '@frappe-local/renderer/components/benches/BenchOverviewTab.vue';
import BenchAppsTab from '@frappe-local/renderer/components/benches/BenchAppsTab.vue';
import { useConfirmAction, trackSiteCreationToast } from '@frappe-local/renderer/composables/ui';
import { useProgressCenter, useResourceTaskState, runAndWaitForTask, useEditorStatus, useDiagnostics } from '@frappe-local/renderer/composables/system';
import { useAppCatalog, useBenches, useSites } from '@frappe-local/renderer/composables/data';
import { useAppHealth } from '@frappe-local/renderer/composables/system/useAppHealth';
import BenchWizardDialog from '@frappe-local/renderer/components/dialogs/BenchWizardDialog.vue';
import SiteWizardDialog from '@frappe-local/renderer/components/dialogs/SiteWizardDialog.vue';
import AppUsageDialog from '@frappe-local/renderer/components/dialogs/AppUsageDialog.vue';
import type { BenchListItem } from '@frappe-local/shared/core';

const { isEditorInstalled } = useEditorStatus();
const { health } = useAppHealth();

const route = useRoute();
const router = useRouter();

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

const { tasks, activeLogTaskId: selectedTaskId } = useProgressCenter();
const { run: runDiagnostics } = useDiagnostics();

const {
  setPendingAction: setPendingBenchAction,
  clearPendingAction: clearPendingBenchAction,
  isResourceBusy,
  formatStatusLabel,
  getStatusTheme,
  getLatestRelevantTaskId,
} = useResourceTaskState('bench', computed(() => tasks.value || []));

const {
  getLatestRelevantTaskId: getLatestRelevantSiteTaskId,
} = useResourceTaskState('site', computed(() => tasks.value || []));

const onSiteCreated = (site: { id: string, name: string }) => {
  trackSiteCreationToast(site, {
    refreshSites,
    selectedTaskId,
    getLatestRelevantTaskId: getLatestRelevantSiteTaskId
  });
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

const selectedBench = computed(() => {
  if (selectedBenchId.value) {
    const found = benches.value.find((b) => b.id === selectedBenchId.value);
    if (found) return found;
  }
  return benches.value[0] ?? null;
});

watch(
  () => benches.value,
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
      group: 'Manage',
      options: [
        {
          label: 'Delete',
          icon: 'lucide-trash-2',
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
      actionMatch = /^(Start|Restart) bench/i;
      setPendingBenchAction(id, 'restarting');
    } else {
      loadingMsg = `Starting bench ${name}`;
      successMsg = `Bench ${name} started.`;
      errorMsg = `Failed to start bench ${name}.`;
      actionMatch = /^(Start|Restart) bench/i;
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
    if (status === 'running') {
      runDiagnostics();
    }
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
  const benchStartTime = Date.now();
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
      trackSiteCreationToast(initialSite, {
        refreshSites,
        selectedTaskId,
        getLatestRelevantTaskId: getLatestRelevantSiteTaskId,
        startTime: benchStartTime
      });
    }
  }).catch(() => {});
};

const onOpenBenchShell = async (id: string) => {
  await openShell(id);
};
</script>

<style scoped>
:deep([data-slot="tab-list"]) {
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}
:deep([data-slot="tab-panel"]) {
  flex: 1 1 0%;
  min-height: 0;
}
</style>
