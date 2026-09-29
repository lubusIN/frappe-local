<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base text-ink-gray-9">
    <PageHeaderBase class="z-10 flex h-12 border-b border-outline-gray-1 bg-surface-base shrink-0 [-webkit-app-region:drag]">
      <!-- List half -->
      <div
        v-show="showList"
        class="flex w-80 sm:w-96 shrink-0 items-center justify-between border-r border-outline-gray-1 px-4"
      >
        <PageHeaderTitle title="Sites" />
        <div class="flex items-center gap-1 [-webkit-app-region:no-drag]">
          <Button
            size="sm"
            variant="solid"
            :icon-left="'lucide-plus'"
            label="Create"
            :disabled="loading || creatableBenches.length === 0"
            @click="showCreateSiteModal = true"
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
          <PageHeaderTitle v-if="selectedSite">
            {{ selectedSite.name }}
          </PageHeaderTitle>
          <PageHeaderTitle v-else>
            Site Details
          </PageHeaderTitle>
          <Badge
            v-if="selectedSite"
            variant="subtle"
            :theme="getDisplayTheme(selectedSite)"
            class="shrink-0 flex items-center gap-1.5 !text-xs"
          >
            <span>{{ getDisplayLabel(selectedSite) }}</span>
            <span
              v-if="isResourceBusy(selectedSite.id)"
              class="inline-block size-2 rounded-full border-[1.5px] border-current border-r-transparent animate-spin"
            />
          </Badge>
        </div>

        <!-- Site actions -->
        <div
          v-if="selectedSite"
          class="flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]"
        >
          <Button
            variant="subtle"
            size="sm"
            :icon-left="'lucide-external-link'"
            label="Open Site"
            :disabled="!isBenchRunning(selectedSite.benchId) || updating || isResourceBusy(selectedSite.id) || (selectedSite.status !== 'ready' && selectedSite.status !== 'failure')"
            @click="ipc.openSiteExternal(selectedSite.id)"
          />
          <Dropdown
            :options="getSiteDetailMoreActions(selectedSite)"
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
      <!-- Site list pane (Master) -->
      <SiteListPane
        v-show="showList"
        v-model="selectedSiteId"
        :sites="sites"
        :all-benches="allBenches"
        :loading="loading"
        :bench-loading="benchLoading"
        :updating="updating"
        :error="error"
        :is-resource-busy="isResourceBusy"
        @select="selectSite"
        @refresh="refresh"
        @create="showCreateSiteModal = true"
        @open-external="ipc.openSiteExternal"
      />

      <!-- Reading / Detail Pane -->
      <section class="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface-base">
        <div
          v-if="!selectedSite"
          class="flex-1 flex items-center justify-center p-8 text-ink-gray-5 text-sm"
        >
          Select a site from the list to inspect details, actions, and apps.
        </div>

        <template v-else>
          <Tabs
            :tabs="[{ label: 'Overview', value: 'Overview' }, { label: 'Apps', value: 'Apps' }]"
            class="flex-1 min-h-0"
          >
            <template #tab-panel="{ tab }">
              <SiteOverviewTab
                v-if="tab.label === 'Overview'"
                :site="selectedSite"
                :is-bench-running="isBenchRunning(selectedSite.benchId)"
                :bench-status="selectedBenchForSiteApps?.status"
                :updating="updating"
                :deleting="deleting"
                :is-busy="isResourceBusy(selectedSite.id)"
                @clean-cache="onCleanCache(selectedSite.id, selectedSite.name)"
                @migrate="onMigrate(selectedSite.id, selectedSite.name)"
                @logs="onStatusClick(selectedSite.id)"
                @reset-status="resetSiteStatus(selectedSite)"
                @open-external="ipc.openSiteExternal(selectedSite.id)"
                @open-folder="openFolder(selectedSite.id)"
                @open-shell="openShell(selectedSite.id)"
                @remove-app="onRequestDeactivateSiteApp"
              />

              <SiteAppsTab
                v-else-if="tab.label === 'Apps'"
                :site="selectedSite"
                :bench-id="selectedBenchForSiteApps?.id"
                :bench-status="selectedBenchForSiteApps?.status"
                :frappe-version="selectedBenchForSiteApps?.frappeVersion"
                :warning-message="siteAppsWarningMessage"
                :can-mutate="canActivateSelectedSiteApps"
                :updating="updating"
                :activating-app-id="activatingSiteAppId"
                @add-app="onActivateSiteApp"
                @remove-app="onRequestDeactivateSiteApp"
              />
            </template>
          </Tabs>

          <!-- Footer Actions Bar -->
          <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-outline-gray-1 px-5 py-3 bg-surface-base">
            <Button
              variant="subtle"
              size="sm"
              :icon-left="'lucide-boxes'"
              @click="goToParentBench(selectedSite.benchId)"
            >
              Go to Bench
            </Button>
          </footer>
        </template>
      </section>
    </div>

    <!-- Modals -->
    <SiteWizardDialog
      v-model:open="showCreateSiteModal"
      @created="onSiteCreated"
    />
    <ConfirmationDialog
      :open="confirmDeleteSiteOpen"
      title="Delete Site"
      :message="`Are you sure you want to delete site &quot;${deleteSiteName}&quot;? This will remove all data and cannot be undone.`"
      confirm-label="Delete"
      @cancel="confirmDeleteSiteOpen = false"
      @confirm="onConfirmDeleteSite"
    />
    <ConfirmationDialog
      :open="removeSiteAppConfirmOpen"
      title="Uninstall app"
      :message="`Are you sure you want to uninstall &quot;${pendingRemoveSiteAppName}&quot; from site &quot;${selectedSiteForApps?.name}&quot;? This will drop the app's database tables and delete all associated data.`"
      confirm-label="Uninstall"
      @cancel="onCancelDeactivateSiteApp"
      @confirm="onConfirmDeactivateSiteApp"
    />
  </div>
</template>

<script setup lang="ts">
import { Badge, Button, Dropdown, PageHeaderBase, PageHeaderTitle, Tabs, toast } from 'frappe-ui';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import { trackSiteCreationToast } from '@frappe-local/renderer/composables/ui';

import SiteListPane from '@frappe-local/renderer/components/sites/SiteListPane.vue';
import SiteOverviewTab from '@frappe-local/renderer/components/sites/SiteOverviewTab.vue';
import SiteAppsTab from '@frappe-local/renderer/components/sites/SiteAppsTab.vue';

import SiteWizardDialog from '@frappe-local/renderer/components/dialogs/SiteWizardDialog.vue';
import { useIpc, useProgressCenter, useResourceTaskState, runAndWaitForTask } from '@frappe-local/renderer/composables/system';
import { toastTask } from '@frappe-local/renderer/composables/ui/toastTask';
import { useAppCatalog, useBenches, useSites } from '@frappe-local/renderer/composables/data';

import type { SiteListItem } from '@frappe-local/shared/core';

const ipc = useIpc();
const router = useRouter();

const {
  sites,
  loading,
  updating,
  deleting,
  error,
  successMessage,
  cleanCache,
  migrate,
  update,
  remove,
  refresh: load,
  openFolder,
  openShell,
} = useSites();

const { tasks, activeLogTaskId: selectedTaskId } = useProgressCenter();

const activatingSiteAppId = ref<string | null>(null);

const refresh = async (force = false) => {
  await load(force);
};

const {
  isResourceBusy,
  formatStatusLabel,
  getStatusTheme,
  getLatestRelevantTaskId,
} = useResourceTaskState('site', computed(() => tasks.value || []));

const onSiteCreated = (site: SiteListItem) => {
  trackSiteCreationToast(site, {
    refreshSites: refresh,
    selectedTaskId,
    getLatestRelevantTaskId
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

const onStatusClick = (resourceId: string) => {
  selectedTaskId.value = getLatestRelevantTaskId(resourceId);
};

const {
  benches: allBenches,
  loading: benchLoading,
} = useBenches();

const getDisplayTheme = (row: SiteListItem) => {
  if (row.status === 'ready') {
    const benchStatus = allBenches.value.find((b) => b.id === row.benchId)?.status;
    if (benchStatus !== 'running') {
      return 'gray';
    }
  }
  return getStatusTheme(row);
};

const getDisplayLabel = (row: SiteListItem) => {
  if (row.status === 'ready') {
    const benchStatus = allBenches.value.find((b) => b.id === row.benchId)?.status;
    if (benchStatus !== 'running') {
      return 'Offline';
    }
  }
  return formatStatusLabel(row);
};

const selectedSiteId = ref<string | undefined>(undefined);
const showList = ref(true);

const selectSite = (id: string) => {
  selectedSiteId.value = id;
};

const isBenchRunning = (benchId: string) => {
  return allBenches.value.find((b) => b.id === benchId)?.status === 'running';
};

const resetSiteStatus = async (site: SiteListItem) => {
  await update(site.id, { status: 'ready' });
  toast.success(`Site "${site.name}" status reset to ready.`);
};

const onCleanCache = async (id: string, name: string) => {
  const promise = runAndWaitForTask(
    () => cleanCache(id),
    'site', id, /^Clean Cache/i
  );
  
  toastTask(promise, {
    loading: `Cleaning cache for ${name}...`,
    success: `Cache cleaned for ${name}.`,
    error: `Failed to clean cache for ${name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(id);
      }
    }
  });
};

const onMigrate = async (id: string, name: string) => {
  const promise = runAndWaitForTask(
    () => migrate(id),
    'site', id, /^Migrate/i
  );
  
  toastTask(promise, {
    loading: `Migrating site ${name}...`,
    success: `Site ${name} migrated successfully.`,
    error: `Failed to migrate site ${name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(id);
      }
    },
  });
};

const confirmDeleteSiteOpen = ref(false);
const deleteSiteId = ref<string | null>(null);
const deleteSiteName = ref('');

const confirmDeleteSite = (id: string, name: string) => {
  deleteSiteId.value = id;
  deleteSiteName.value = name;
  confirmDeleteSiteOpen.value = true;
};

const onConfirmDeleteSite = async () => {
  if (!deleteSiteId.value) return;
  
  const id = deleteSiteId.value;
  const name = deleteSiteName.value;
  
  confirmDeleteSiteOpen.value = false;
  
  try {
    const promise = runAndWaitForTask(
      () => remove(id),
      'site', id, /^Delete site/i
    );
    
    toastTask(promise, {
      loading: `Deleting site ${name}...`,
      success: `Site ${name} deleted successfully.`,
      error: `Failed to delete site ${name}.`,
      action: {
        label: 'View logs',
        onClick: (e?: Event) => {
          e?.preventDefault();
          selectedTaskId.value = getLatestRelevantTaskId(id);
        }
      },
    });
    
    await promise;
    await refresh(true);
  } catch {
    // Error is handled by toast
  }
};

const getSiteDetailMoreActions = (site: SiteListItem) => {
  return [
    {
      group: 'Manage',
      options: [
        {
          label: 'Delete',
          icon: 'lucide-trash-2',
          theme: 'red' as const,
          disabled: !isBenchRunning(site.benchId) || updating.value || deleting.value || isResourceBusy(site.id),
          onClick: () => confirmDeleteSite(site.id, site.name),
        },
      ],
    }
  ];
};

const goToParentBench = (benchId: string) => {
  void router.push({ path: '/benches', query: { benchId } });
};

const showCreateSiteModal = ref(false);
const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));

const selectedSite = computed(() => {
  if (selectedSiteId.value) {
    const found = sites.value.find((s) => s.id === selectedSiteId.value);
    if (found) return found;
  }
  return sites.value[0] ?? null;
});

watch(
  () => sites.value,
  (list) => {
    if (list.length > 0 && (!selectedSiteId.value || !sites.value.some((s) => s.id === selectedSiteId.value))) {
      selectedSiteId.value = list[0]?.id;
    }
  },
  { immediate: true }
);

const selectedSiteForApps = computed(() => selectedSite.value);

const selectedBenchForSiteApps = computed(() => {
  if (!selectedSiteForApps.value) return null;
  return allBenches.value.find((bench) => bench.id === selectedSiteForApps.value?.benchId) ?? null;
});

const siteAppsWarningMessage = computed(() => {
  const site = selectedSiteForApps.value;
  if (!site) return null;
  
  const siteReady = site.status === 'ready' || site.status === 'failure';
  if (!siteReady) return 'Wait for site to be ready before managing apps.';
  
  if (isResourceBusy(site.id)) return 'Site app management is currently in progress. Please wait.';
  
  const bench = allBenches.value.find((b) => b.id === site.benchId);
  const isBenchReady = bench && (bench.status === 'running' || bench.status === 'success');
  if (!isBenchReady) return 'Start the bench before managing site apps.';
  
  const isBenchBusy = tasks.value.some(t => t.resource === 'bench' && t.resourceId === site.benchId && (t.status === 'queued' || t.status === 'running'));
  if (isBenchBusy) return 'Wait for bench app management to finish before managing site apps.';
  
  return null;
});

const canActivateSelectedSiteApps = computed(() => siteAppsWarningMessage.value === null);

const { getAppTitle } = useAppCatalog();

const removeSiteAppConfirmOpen = ref(false);
const pendingRemoveSiteAppId = ref<string | null>(null);
const pendingRemoveSiteAppName = ref('');

const onActivateSiteApp = async (appId: string) => {
  const site = selectedSiteForApps.value;
  if (!site) return;

  if (site.status !== 'ready' && site.status !== 'failure') {
    toast.error('Wait for site to be ready or in failure state before installing apps.');
    return;
  }

  const bench = allBenches.value.find((b) => b.id === site.benchId);
  if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
    toast.error('Bench must be running before managing site apps.');
    return;
  }

  const appTitle = getAppTitle(appId);

  const existingApps = site.apps ?? [];
  if (existingApps.includes(appId)) {
    return;
  }

  activatingSiteAppId.value = appId;
  const nextApps = Array.from(new Set([...existingApps, appId]));

  const promise = runAndWaitForTask(
    () => update(site.id, { apps: nextApps }),
    'site', site.id, /^Install app/i
  ).then(async (res) => {
    await load(true);
    return res;
  });

  toastTask(promise, {
    loading: `Installing app ${appTitle} on site ${site.name}`,
    success: `Installed app ${appTitle} on site ${site.name}`,
    error: `Failed to install app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(site.id);
      }
    }
  });

  try {
    await promise;
  } catch {
    // Error handled by toast
  } finally {
    activatingSiteAppId.value = null;
  }
};

const onRequestDeactivateSiteApp = (appId: string) => {
  const site = selectedSiteForApps.value;
  if (!site) return;

  pendingRemoveSiteAppId.value = appId;
  pendingRemoveSiteAppName.value = getAppTitle(appId);
  removeSiteAppConfirmOpen.value = true;
};

const onCancelDeactivateSiteApp = () => {
  removeSiteAppConfirmOpen.value = false;
  pendingRemoveSiteAppId.value = null;
  pendingRemoveSiteAppName.value = '';
};

const onConfirmDeactivateSiteApp = async () => {
  const site = selectedSiteForApps.value;
  const appId = pendingRemoveSiteAppId.value;
  
  if (!site || !appId) {
    onCancelDeactivateSiteApp();
    return;
  }

  const appTitle = pendingRemoveSiteAppName.value || appId;

  const bench = allBenches.value.find((b) => b.id === site.benchId);
  if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
    toast.error('Bench must be running before managing site apps.');
    onCancelDeactivateSiteApp();
    return;
  }

  removeSiteAppConfirmOpen.value = false;

  const existingApps = site.apps ?? [];
  const nextApps = existingApps.filter(id => id !== appId);

  const promise = runAndWaitForTask(
    () => update(site.id, { apps: nextApps }),
    'site', site.id, /^Uninstall app/i
  ).then(async (res) => {
    await load(true);
    return res;
  });

  toastTask(promise, {
    loading: `Uninstalling app ${appTitle} from site ${site.name}`,
    success: `Uninstalled app ${appTitle} from site ${site.name}`,
    error: `Failed to uninstall app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(site.id);
      }
    }
  });
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
