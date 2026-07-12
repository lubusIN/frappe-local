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
            :icon-left="IconPlus"
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
            :icon="showList ? IconPanelLeftClose : IconPanelLeft"
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

        <!-- Site actions: Open / Folder / Logs / Reset + More dropdown -->
        <div
          v-if="selectedSite"
          class="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
        >
          <Button
            variant="ghost"
            :icon="IconExternalLink"
            tooltip="Open in Browser"
            :disabled="!isBenchRunning(selectedSite.benchId) || updating || isResourceBusy(selectedSite.id) || (selectedSite.status !== 'ready' && selectedSite.status !== 'failure')"
            @click="ipc.openSiteExternal(selectedSite.id)"
          />
          <Button
            variant="ghost"
            :icon="IconFolderOpen"
            tooltip="Open Site Folder"
            @click="openFolder(selectedSite.id)"
          />
          <Button
            variant="ghost"
            :icon="IconActivity"
            tooltip="Task Logs"
            @click="onStatusClick(selectedSite.id)"
          />
          <Button
            v-if="selectedSite.status === 'failure'"
            variant="ghost"
            :icon="IconRotateCcw"
            tooltip="Reset Status"
            :disabled="!isBenchRunning(selectedSite.benchId) || updating || isResourceBusy(selectedSite.id)"
            @click="resetSiteStatus(selectedSite)"
          />
          <Dropdown
            :options="getSiteDetailMoreActions(selectedSite)"
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
      <!-- Site list pane (Master) -->
      <section
        v-show="showList"
        class="flex h-full min-h-0 w-80 sm:w-96 shrink-0 flex-col border-r border-outline-gray-1 bg-surface-base"
      >
        <!-- Search & Status Filter Bar pinned above list -->
        <div
          v-if="!error && sites.length > 0"
          class="flex flex-col gap-2 shrink-0 border-b border-outline-gray-1 px-4 py-2.5 bg-surface-base"
        >
          <div class="flex items-center gap-2 w-full min-w-0">
            <TextInput
              v-model="siteFilters.search"
              type="search"
              placeholder="Search sites..."
              size="sm"
              variant="outline"
              class="flex-1 min-w-0"
            >
              <template #prefix>
                <IconSearch class="w-4 text-ink-gray-5" />
              </template>
            </TextInput>

            <Select
              v-model="benchFilterSelection"
              :options="benchFilterOptions"
              size="sm"
              variant="outline"
              class="w-36 shrink-0"
            >
              <template #prefix>
                <IconListFilter class="w-4 text-ink-gray-5" />
              </template>
            </Select>
          </div>

          <div class="flex items-center justify-between gap-2 w-full mt-0.5 min-w-0">
            <TabButtons
              v-model="siteFilters.status"
              :options="statusTabOptions"
              class="justify-start overflow-x-auto no-scrollbar min-w-0"
            />
            <span class="text-sm text-ink-gray-5">
              {{ currentStatusCount }} sites
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
              body="Sites are attached to benches. Once you have one running bench, this screen becomes the main place to create, control, and export sites."
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
              :icon="IconGlobe"
            >
              <div
                v-if="creatableBenches.length > 0"
                class="mt-4"
              >
                <Button
                  size="sm"
                  variant="solid"
                  @click="showCreateSiteModal = true"
                >
                  Create site
                </Button>
              </div>
              <div
                v-else
                class="mt-4"
              >
                <Button
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
              :icon="IconSearch"
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
                  <ListCell class="self-start justify-end pt-3.5">
                    <div class="flex items-center gap-1.5 shrink-0">
                      <span
                        v-if="isResourceBusy(site.id)"
                        class="inline-block size-3 rounded-full border-[1.5px] border-ink-gray-6 border-r-transparent animate-spin"
                      />
                      <span
                        v-if="site.port"
                        class="text-xs font-mono text-ink-gray-5"
                      >
                        :{{ site.port }}
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
          v-if="!selectedSite"
          class="flex-1 flex items-center justify-center p-8 text-ink-gray-5 text-sm"
        >
          Select a site from the list to inspect details, actions, and apps.
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
                    <Badge
                      variant="subtle"
                      theme="gray"
                    >
                      {{ selectedSite.appCount }} Installed
                    </Badge>
                  </div>
                </div>

                <div
                  v-if="siteAppsWarningMessage"
                  class="pt-2"
                >
                  <Alert 
                    theme="yellow" 
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
            </div>
          </ScrollArea>

          <!-- Footer Actions Bar pinned at bottom of reading pane -->
          <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-outline-gray-1 px-5 py-3 bg-surface-base">
            <Button
              variant="subtle"
              size="sm"
              :icon-left="IconPackage"
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
import { Alert, Badge, Button, Dropdown, PageHeaderBase, PageHeaderTitle, ScrollArea, Select, TabButtons, TextInput, toast } from 'frappe-ui';
import { List, ListCell, ListRow, ListRows } from 'frappe-ui/list';
import IconGlobe from '~icons/lucide/globe';
import IconSearch from '~icons/lucide/search';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconExternalLink from '~icons/lucide/external-link';
import IconActivity from '~icons/lucide/activity';
import IconFolderOpen from '~icons/lucide/folder-open';
import IconPackage from '~icons/lucide/package';
import IconTrash2 from '~icons/lucide/trash2';
import IconPlus from '~icons/lucide/plus';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconPanelLeftClose from '~icons/lucide/panel-left-close';
import IconPanelLeft from '~icons/lucide/panel-left';
import IconListFilter from '~icons/lucide/list-filter';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';

import FirstRunGuide, { type FirstRunGuideLink } from '@frappe-local/renderer/components/FirstRunGuide.vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import AppManager from '@frappe-local/renderer/components/AppManager.vue';
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
  update,
  remove,
  refresh: load,
  openFolder,
} = useSites();

const { tasks, activeLogTaskId: selectedTaskId } = useProgressCenter();
const activatingSiteAppId = ref<string | null>(null);

const refresh = async (force = false) => {
  await load(force);
};

const onSiteCreated = async (site: SiteListItem) => {
  void refresh(true);
  const promise = runAndWaitForTask(() => Promise.resolve(), 'site', site.id, /^Create Site/i).then(() => refresh(true));
  const toastId = toast.loading(`Creating site ${site.name}`, {
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(site.id);
      }
    }
  });

  promise.then(() => {
    toast.success(`Site ${site.name} created.`, {
      id: toastId,
      action: {
        label: 'Open',
        onClick: (e?: Event) => {
          e?.preventDefault();
          void ipc.openSiteExternal(site.id).then((opened) => {
            if (!opened) {
              toast.error(`Unable to open ${site.name}.`);
            }
          });
        }
      }
    });
  }).catch(() => {
    toast.error(`Failed to create site ${site.name}.`, {
      id: toastId,
      action: {
        label: 'View logs',
        onClick: (e?: Event) => {
          e?.preventDefault();
          selectedTaskId.value = getLatestRelevantTaskId(site.id);
        }
      }
    });
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

const statusTabs = computed(() => [
  { label: 'All', value: '', count: sites.value.length },
  { label: 'Ready', value: 'ready', count: sites.value.filter((s) => s.status === 'ready').length },
  { label: 'In Progress', value: 'queued', count: sites.value.filter((s) => s.status === 'queued').length },
  { label: 'Error', value: 'failure', count: sites.value.filter((s) => s.status === 'failure').length },
]);

const statusTabOptions = computed(() =>
  statusTabs.value.map((tab) => ({
    label: tab.label,
    value: tab.value,
  }))
);

const currentStatusCount = computed(() => {
  const currentTab = statusTabs.value.find((t) => t.value === siteFilters.status);
  return currentTab ? currentTab.count : sites.value.length;
});

const selectedSiteId = ref<string | null>(null);
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

const getSiteDetailMoreActions = (site: SiteListItem) => {
  return [
    {
      label: 'Delete',
      icon: IconTrash2,
      theme: 'red' as const,
      disabled: !isBenchRunning(site.benchId) || updating.value || deleting.value || isResourceBusy(site.id),
      onClick: () => confirmDeleteSite(site.id, site.name),
    },
  ];
};

const goToParentBench = (benchId: string) => {
  void router.push({ path: '/benches', query: { benchId } });
};

const showCreateSiteModal = ref(false);
const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));
const siteFilters = reactive({
  benchId: '',
  status: '',
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
  siteFilters.status = '';
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
      selectedSiteId.value = list[0].id;
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
  
  const isBenchBusy = tasks.value.some(t => t.resource === 'bench' && t.resourceId === site.benchId && (t.status === 'pending' || t.status === 'running'));
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
