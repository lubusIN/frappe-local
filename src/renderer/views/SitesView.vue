<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base text-ink-gray-9">
    <!--
      One split header, not two boxy headers. PageHeaderBase teleports to
      DesktopShell's pinned header slot so it sits cleanly across both panes.
    -->
    <PageHeaderBase class="z-10 flex h-12 border-b border-outline-gray-1 bg-surface-base shrink-0 [-webkit-app-region:drag]">
      <!-- List half — width + right border track the list pane below exactly. -->
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

      <!-- Reading / Detail half — fills the rest. -->
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
      <section
        v-show="showList"
        class="flex h-full min-h-0 w-80 sm:w-96 shrink-0 flex-col border-r border-outline-gray-1 bg-surface-base"
      >
        <!-- Search & Status Filter Bar pinned above list -->
        <div
          v-if="!error && sites.length > 0"
          class="flex items-center gap-2 shrink-0 border-b border-outline-gray-1 px-4 py-2 bg-surface-base w-full min-w-0"
        >
          <div class="flex-1 min-w-0">
            <FormControl
              v-model="siteFilters.search"
              type="text"
              placeholder="Search sites..."
              size="sm"
              variant="outline"
            >
              <template #prefix>
                <i class="lucide-search w-4 text-ink-gray-5" />
              </template>
            </FormControl>
          </div>

          <div class="w-36 shrink-0">
            <FormControl
              v-model="benchFilterSelection"
              type="select"
              :options="benchFilterOptions"
              size="sm"
              variant="outline"
            >
              <template #prefix>
                <i class="lucide-list-filter w-4 text-ink-gray-5" />
              </template>
            </FormControl>
          </div>
        </div>

        <ScrollArea
          class="min-h-0 flex-1"
          viewport-class="p-1"
        >
          <StatePanel
            v-if="error"
            kind="error"
            title="Unable to load sites"
            :body="error"
            action-label="Retry"
            @action="refresh"
          />

          <div
            v-else-if="!loading && !benchLoading && allBenches.length === 0"
            class="p-3"
          >
            <FirstRunGuide
              title="Create a bench first"
              body="Sites live on bench, create one to get started."
              :links="siteSetupLinks"
              compact
            />
          </div>

          <StatePanel
            v-else-if="loading && sites.length === 0"
            kind="loading"
            title="Loading sites"
            body="Fetching sites and status metadata."
          />

          <div
            v-else-if="sites.length === 0"
            class="p-3"
          >
            <EmptyState
              title="No sites yet"
              description="Create your first site to manage runtime status, inspect logs, and access dashboards."
              :icon="'lucide-app-window'"
            >
              <div class="mt-4">
                <Button
                  v-if="creatableBenches.length > 0"
                  size="sm"
                  variant="solid"
                  @click="showCreateSiteModal = true"
                >
                  Create site
                </Button>
                <Button
                  v-else
                  size="sm"
                  variant="subtle"
                  @click="$router.push('/benches')"
                >
                  Go to Benches
                </Button>
              </div>
            </EmptyState>
          </div>

          <div
            v-else-if="filteredSites.length === 0"
            class="p-3"
          >
            <EmptyState
              title="No matching sites"
              description="No sites match the current bench, status, or search filters."
              :icon="'lucide-search'"
            >
              <Button
                size="sm"
                variant="subtle"
                class="mt-2"
                @click="clearSiteFilters"
              >
                Clear filters
              </Button>
            </EmptyState>
          </div>

          <template v-else>
            <List
              v-model:active="selectedSiteId"
              :columns="['minmax(0,1fr)', 'auto']"
              :style="{ '--list-row-padding-x': '1rem' }"
            >
              <ListRows
                v-slot="{ item: site, value }"
                :items="filteredSites"
                row-key="id"
              >
                <ListRow
                  :value="value"
                  class="group"
                  @click="selectSite(site.id)"
                >
                  <ListCell>
                    <div class="min-w-0 py-3">
                      <div
                        class="truncate inline-flex items-center text-sm text-ink-gray-8"
                        :class="selectedSiteId === site.id && 'font-semibold text-ink-gray-9'"
                      >
                        <span
                          class="mr-2 inline-block size-2 rounded-full align-middle shrink-0"
                          :class="site.status === 'ready' ? (isBenchRunning(site.benchId) ? 'bg-surface-green-7' : 'bg-surface-gray-5') : site.status === 'queued' ? 'bg-surface-yellow-7 animate-pulse' : 'bg-surface-red-7'"
                        />
                        <span class="truncate">{{ site.name }}</span>
                      </div>
                      <div class="truncate text-xs text-ink-gray-5 mt-0.5 pl-4">
                        {{ getBenchName(site.benchId) }}
                      </div>
                    </div>
                  </ListCell>
                  <ListCell class="self-center justify-end">
                    <div class="flex items-center gap-1.5 shrink-0">
                      <span
                        v-if="isResourceBusy(site.id)"
                        class="inline-block size-3 rounded-full border-[1.5px] border-ink-gray-6 border-r-transparent animate-spin"
                      />
                      <Button
                        v-if="isBenchRunning(site.benchId)"
                        variant="ghost"
                        :icon="'lucide-external-link'"
                        class="!size-7 transition-opacity"
                        :class="[
                          selectedSiteId === site.id ? 'text-ink-gray-9 opacity-100' : 'text-ink-gray-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink-gray-9'
                        ]"
                        tooltip="Open in Browser"
                        :disabled="!isBenchRunning(site.benchId) || updating || isResourceBusy(site.id) || (site.status !== 'ready' && site.status !== 'failure')"
                        @click.stop="ipc.openSiteExternal(site.id)"
                      />
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
          v-if="!selectedSite"
          class="flex-1 flex items-center justify-center p-8 text-ink-gray-5 text-sm"
        >
          Select a site from the list to inspect details, actions, and apps.
        </div>

        <template v-else>
          <Tabs :tabs="[{ label: 'Overview', value: 'Overview' }, { label: 'Apps', value: 'Apps' }]" class="flex-1 min-h-0">
            <template #tab-panel="{ tab }">
              <ScrollArea
                v-if="tab.label === 'Overview'"
                class="h-full"
              >
                <div class="space-y-8 px-6 py-5 w-full max-w-3xl">
                  <!-- Manage Section -->
                  <div class="flex flex-col gap-3">
                    <h3 class="text-base-semibold text-ink-gray-9">
                      Manage
                    </h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      <Button
                        variant="outline"
                        size="md"
                        icon-left="lucide-eraser"
                        label="Clean Cache"
                        class="!justify-start w-full"
                        :disabled="!isBenchRunning(selectedSite.benchId) || updating || deleting || isResourceBusy(selectedSite.id)"
                        @click="onCleanCache(selectedSite.id, selectedSite.name)"
                      />
                      <Button
                        variant="outline"
                        size="md"
                        icon-left="lucide-database"
                        label="Migrate"
                        class="!justify-start w-full"
                        :disabled="!isBenchRunning(selectedSite.benchId) || updating || deleting || isResourceBusy(selectedSite.id)"
                        @click="onMigrate(selectedSite.id, selectedSite.name)"
                      />
                      <Button
                        variant="outline"
                        size="md"
                        icon-left="lucide-activity"
                        label="Task Logs"
                        class="!justify-start w-full"
                        @click="onStatusClick(selectedSite.id)"
                      />
                      <Button
                        v-if="selectedSite.status === 'failure'"
                        variant="outline"
                        size="md"
                        icon-left="lucide-rotate-ccw"
                        label="Reset Status"
                        class="!justify-start w-full"
                        :disabled="!isBenchRunning(selectedSite.benchId) || updating || isResourceBusy(selectedSite.id)"
                        @click="resetSiteStatus(selectedSite)"
                      />
                    </div>
                  </div>

                  <!-- Open in Section -->
                  <div class="flex flex-col gap-3">
                    <h3 class="text-base-semibold text-ink-gray-9">
                      Open in
                    </h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      <Button
                        v-if="isBenchRunning(selectedSite.benchId)"
                        variant="outline"
                        size="md"
                        icon-left="lucide-external-link"
                        label="Browser"
                        class="!justify-start w-full"
                        :disabled="!isBenchRunning(selectedSite.benchId) || updating || isResourceBusy(selectedSite.id) || (selectedSite.status !== 'ready' && selectedSite.status !== 'failure')"
                        @click="ipc.openSiteExternal(selectedSite.id)"
                      />
                      <Button
                        variant="outline"
                        size="md"
                        icon-left="lucide-folder-open"
                        label="Folder"
                        class="!justify-start w-full"
                        @click="openFolder(selectedSite.id)"
                      />
                      <Button
                        variant="outline"
                        size="md"
                        icon-left="lucide-terminal"
                        label="Terminal"
                        class="!justify-start w-full"
                        :disabled="!isBenchRunning(selectedSite.benchId) || isResourceBusy(selectedSite.id) || (selectedSite.status !== 'ready' && selectedSite.status !== 'failure')"
                        @click="openShell(selectedSite.id)"
                      />
                    </div>
                  </div>

                  <!-- Installed Apps Section -->
                  <InstalledAppsSection
                    :app-ids="selectedSiteForApps?.apps || []"
                    :bench-id="selectedSite.benchId"
                    :bench-status="selectedBenchForSiteApps?.status"
                    context="site"
                    @remove-app="onRequestDeactivateSiteApp"
                  />
                </div>
              </ScrollArea>

              <ScrollArea
                v-else-if="tab.label === 'Apps'"
                class="h-full"
              >
                <div class="flex flex-col gap-4 px-6 py-5 w-full">
                  <!-- APPS Section -->
                  <div
                    v-if="siteAppsWarningMessage"
                    class="pt-2"
                  >
                    <Alert 
                      theme="amber" 
                      :title="siteAppsWarningMessage" 
                      :dismissible="false" 
                    />
                  </div>

                  <AppManager
                    class="pt-1 w-full"
                    container-class="flex flex-col gap-1 w-full"
                    :resource-id="selectedBenchForSiteApps?.id"
                    :bench-status="selectedBenchForSiteApps?.status"
                    context="site"
                    :active-app-ids="Array.from(siteActivatedAppSet)"
                    :disabled="updating || !canActivateSelectedSiteApps"
                    :frappe-version="selectedBenchForSiteApps?.frappeVersion"
                    :loading-app-id="activatingSiteAppId"
                    @add-app="onActivateSiteApp"
                    @remove-app="onRequestDeactivateSiteApp"
                    @install-app="onActivateSiteApp"
                    @uninstall-app="onRequestDeactivateSiteApp"
                  />
                </div>
              </ScrollArea>
            </template>
          </Tabs>

          <!-- Footer Actions Bar pinned at bottom of reading pane -->
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

<script setup lang="ts">
import { Alert, Badge, Button, Dropdown, FormControl, PageHeaderBase, PageHeaderTitle, ScrollArea, Tabs, toast } from 'frappe-ui';
import { List, ListCell, ListRow, ListRows } from 'frappe-ui/list';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import { trackSiteCreationToast } from '@frappe-local/renderer/composables/ui';

import FirstRunGuide, { type FirstRunGuideLink } from '@frappe-local/renderer/components/FirstRunGuide.vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import AppManager from '@frappe-local/renderer/components/AppManager.vue';
import InstalledAppsSection from '@frappe-local/renderer/components/InstalledAppsSection.vue';
import SiteWizardDialog from '@frappe-local/renderer/components/dialogs/SiteWizardDialog.vue';
import { useIpc, useProgressCenter, useResourceTaskState, runAndWaitForTask } from '@frappe-local/renderer/composables/system';
import { useAppCatalog, useBenches, useSites } from '@frappe-local/renderer/composables/data';

import { filterSites } from '@frappe-local/renderer/utils/sites';

import type { SiteListItem } from '@frappe-local/shared/core';

const ipc = useIpc();
const route = useRoute();
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



const {
  isResourceBusy,
  formatStatusLabel,
  getStatusTheme,
  getLatestRelevantTaskId,
} = useResourceTaskState('site', computed(() => tasks.value || []));

const onStatusClick = (resourceId: string) => {
  selectedTaskId.value = getLatestRelevantTaskId(resourceId);
};

const SELECT_ALL = '__all__';

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
  
  toast.promise(promise, {
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
  
  toast.promise(promise, {
    loading: `Migrating site ${name}...`,
    success: `Site ${name} migrated successfully.`,
    error: `Failed to migrate site ${name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(id);
      }
    }
  });
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
const siteFilters = reactive({
  benchId: '',
  search: '',
});
const benchFilterSelection = computed({
  get: () => siteFilters.benchId || SELECT_ALL,
  set: (value: string) => {
    siteFilters.benchId = value === SELECT_ALL ? '' : value;
  },
});
const benchFilterOptions = computed(() => [
  { label: 'All benches', value: SELECT_ALL },
  ...allBenches.value.map((bench) => ({ label: bench.name, value: bench.id })),
]);
const filteredSites = computed(() => filterSites(sites.value, siteFilters));
const clearSiteFilters = (): void => {
  siteFilters.benchId = '';
  siteFilters.search = '';
};

const selectedSite = computed(() => {
  if (selectedSiteId.value) {
    const found = sites.value.find((s) => s.id === selectedSiteId.value);
    if (found) return found;
  }
  return filteredSites.value[0] ?? sites.value[0] ?? null;
});

watch(
  () => filteredSites.value,
  (list) => {
    if (list.length > 0 && (!selectedSiteId.value || !sites.value.some((s) => s.id === selectedSiteId.value))) {
      selectedSiteId.value = list[0]?.id;
    }
  },
  { immediate: true }
);
const siteSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Go to Benches', to: '/benches' },
  { label: 'Review runtime', to: '/diagnostics' },
]);

const getBenchName = (id: string) => {
  const bench = allBenches.value.find((b) => b.id === id);
  return bench ? bench.name : id;
};

const selectedSiteForApps = computed(() => selectedSite.value);

const selectedBenchForSiteApps = computed(() => {
  if (!selectedSiteForApps.value) return null;
  return allBenches.value.find((bench) => bench.id === selectedSiteForApps.value?.benchId) ?? null;
});

const siteActivatedAppSet = computed(() => new Set(selectedSiteForApps.value?.apps ?? []));

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

const { getAppInfo, getAppTitle } = useAppCatalog();

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

  toast.promise(promise, {
    loading: `Installing app ${appTitle} on ${site.name}`,
    success: `Installed app ${appTitle} on ${site.name}`,
    error: `Failed to install app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(site.id);
      },
    },
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
  const appId = pendingRemoveSiteAppId.value;
  if (!appId) {
    onCancelDeactivateSiteApp();
    return;
  }

  removeSiteAppConfirmOpen.value = false;
  pendingRemoveSiteAppId.value = null;

  await onDeactivateSiteApp(appId);
};

const onDeactivateSiteApp = async (appId: string) => {
  const site = selectedSiteForApps.value;
  if (!site) return;

  if (site.status !== 'ready' && site.status !== 'failure') {
    toast.error('Wait for site to be ready or in failure state before uninstalling apps.');
    return;
  }

  const bench = allBenches.value.find((b) => b.id === site.benchId);
  if (!bench || (bench.status !== 'running' && bench.status !== 'success')) {
    toast.error('Bench must be running before managing site apps.');
    return;
  }

  const existingApps = site.apps ?? [];
  const info = getAppInfo(appId);
  if (!existingApps.includes(appId) && !(info.id && existingApps.includes(info.id)) && !existingApps.includes(info.name)) {
    return;
  }

  activatingSiteAppId.value = appId;
  const nextApps = existingApps.filter((x) => x !== appId && x !== info.id && x !== info.name);

  const promise = runAndWaitForTask(
    () => update(site.id, { apps: nextApps }),
    'site', site.id, /^Uninstall app/i
  ).then(async (res) => {
    await load(true);
    return res;
  });

  const appTitle = pendingRemoveSiteAppName.value || getAppTitle(appId);
  toast.promise(promise, {
    loading: `Uninstalling app ${appTitle} from ${site.name}`,
    success: `Uninstalled app ${appTitle} from ${site.name}`,
    error: `Failed to uninstall app ${appTitle}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(site.id);
      },
    },
  });

  try {
    await promise;
  } catch {
    // Error handled by toast
  } finally {
    activatingSiteAppId.value = null;
    pendingRemoveSiteAppName.value = '';
  }
};

const confirmDeleteSiteOpen = ref(false);
const deleteSiteId = ref<string | null>(null);
const deleteSiteName = ref('');

const confirmDeleteSite = (id: string, name: string) => {
  deleteSiteId.value = id;
  deleteSiteName.value = name;
  confirmDeleteSiteOpen.value = true;
};

const cancelDeleteSite = () => {
  confirmDeleteSiteOpen.value = false;
  deleteSiteId.value = null;
  deleteSiteName.value = '';
};

const onConfirmDeleteSite = async (): Promise<void> => {
  const id = deleteSiteId.value;
  const name = deleteSiteName.value;
  if (!id) {
    return;
  }
  confirmDeleteSiteOpen.value = false;
  
  const promise = runAndWaitForTask(
    () => remove(id),
    'site', id, /^Delete site/i
  );
  toast.promise(promise, {
    loading: `Deleting site ${name}`,
    success: `Site ${name} deleted.`,
    error: `Failed to delete site ${name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(id);
      },
    },
  });
  
  try {
    await promise;
  } catch {
    // Error handled by toast
  } finally {
    cancelDeleteSite();
  }
};

onMounted(() => {
  if (route.query.benchId && typeof route.query.benchId === 'string') {
    siteFilters.benchId = route.query.benchId;
  }
});
</script>
