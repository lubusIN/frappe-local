<template>
  <DesktopShell
    :scroll="false"
    class="w-screen h-screen overflow-hidden bg-surface-base"
  >
    <template #sidebar>
      <Sidebar
        v-model:collapsed="isCollapsed"
        class="border-r border-outline-gray-1 bg-surface-gray-1"
      >
        <div class="flex h-full flex-col py-2">
          <!-- Header -->
          <div
            class="flex items-center mx-2 p-3 pt-8 transition-all duration-300 [-webkit-app-region:drag]"
            :class="isCollapsed ? 'justify-center' : ''"
          >
            <AppLogo />
            <div 
              v-if="!isCollapsed"
              class="flex flex-col ml-3 truncate transition-all duration-300"
            >
              <span class="text-sm-bold leading-tight text-ink-gray-9">Frappe Local</span>
              <span class="text-xs-medium text-ink-gray-5 leading-tight mt-0.5">v{{ appVersion }}</span>
            </div>
          </div>

          <!-- Navigation -->
          <ScrollArea
            class="min-h-0 flex-1"
            viewport-class="px-2"
          >
            <div class="flex flex-col gap-0.5 py-0.5">
              <SidebarItem
                v-for="item in mainNavItems"
                :key="item.path"
                :label="item.label"
                :icon="iconComponentMap[item.path] || IconGlobe"
                :to="item.path"
                :active="item.path === '/sites' ? (route.path === '/' || route.path.startsWith('/sites')) : route.path.startsWith(item.path)"
              >
                <template
                  v-if="getItemCount(item.path) !== null && getItemCount(item.path)! > 0"
                  #suffix
                >
                  <Badge
                    variant="ghost"
                    theme="gray"
                    :label="String(getItemCount(item.path))"
                  />
                </template>
              </SidebarItem>
            </div>
          </ScrollArea>

          <!-- Footer items -->
          <div class="mt-auto flex flex-col gap-1 px-2">
            <Alert
              v-if="!isFrontDoorAvailable"
              class="mb-2 transition-all duration-300"
              :class="isCollapsed ? 'hidden' : 'block'"
              theme="yellow"
              title="Port 80 Unavailable"
              variant="outline"
              :dismissible="false"
            >
              <template #footer>
                <p class="col-span-full -mt-1.5 text-xs text-ink-gray-7 leading-tight">
                  using port based urls.
                </p>
              </template>
            </Alert>

            <Alert
              v-if="updateState !== 'idle'"
              class="mb-2 transition-all duration-300 bg-surface-base"
              :class="isCollapsed ? 'hidden' : 'block'"
              theme="blue"
              :title="updateState === 'available' ? 'Update Available' : updateState === 'downloading' ? 'Downloading Update...' : 'Update Ready'"
              variant="outline"
              :dismissible="updateState === 'available'"
              @update:dismissed="dismissUpdate"
            >
              <template #footer>
                <div class="col-span-full -mt-1.5 flex flex-col gap-2">
                  <p class="text-xs text-ink-gray-7 leading-tight">
                    v{{ updateVersion }}
                  </p>
                  <Button
                    v-if="updateState === 'available'"
                    size="xs"
                    variant="solid"
                    @click="triggerDownload"
                  >
                    Download
                  </Button>
                  <Button
                    v-else-if="updateState === 'downloading'"
                    size="xs"
                    variant="subtle"
                    loading
                    disabled
                  >
                    Downloading...
                  </Button>
                  <Button
                    v-else-if="updateState === 'downloaded'"
                    size="xs"
                    variant="subtle"
                    :loading="isInstalling"
                    :disabled="isInstalling"
                    @click="triggerInstall"
                  >
                    {{ isInstalling ? 'Restarting...' : 'Restart & Install' }}
                  </Button>
                </div>
              </template>
            </Alert>

            <SidebarItem
              label="Settings"
              :icon="IconSettings"
              :active="isSettingsOpen"
              @click="openSettings"
            />
            <SidebarItem
              :label="isCollapsed ? 'Expand' : 'Collapse'"
              @click="isCollapsed = !isCollapsed"
            >
              <template #prefix>
                <IconPanelRightOpen
                  class="size-4 text-ink-gray-6 transition-transform duration-300 ease-in-out"
                  :class="{ 'rotate-180': isCollapsed }"
                />
              </template>
            </SidebarItem>
          </div>
        </div>
      </Sidebar>
    </template>

    <div
      v-if="showIpcWarning"
      class="mx-6 mt-4 shrink-0"
    >
      <ErrorNotice
        :notice="{
          title: 'Desktop services unavailable',
          message: 'Preload bridge failed. Runtime actions will be unavailable until the connection is restored.',
        }"
      />
    </div>

    <main
      class="flex-1 flex flex-col min-h-0 min-w-0"
      :class="['sites', 'benches'].includes(String(route.name)) ? 'overflow-hidden' : 'p-8 overflow-y-auto'"
    >
      <RouterView />
    </main>

    <SettingsDialog
      :open="isSettingsOpen"
      @close="closeSettings"
    />

    <TaskLogDialog
      v-if="selectedTaskLog"
      :task="selectedTaskLog"
      @close="activeLogTaskId = null"
    />
  </DesktopShell>
</template>

<script setup lang="ts">
import { Alert, Badge, Button, DesktopShell, ScrollArea, Sidebar, SidebarItem, toast } from 'frappe-ui';
import IconSettings from '~icons/lucide/settings';
import IconActivity from '~icons/lucide/activity';
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import IconZap from '~icons/lucide/zap';
import IconBlocks from '~icons/lucide/blocks';
import IconPanelRightOpen from '~icons/lucide/panel-right-open';
import { computed, onMounted, ref, type Component, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppLogo from '@frappe-local/renderer/components/ui/AppLogo.vue';
import SettingsDialog from '@frappe-local/renderer/components/dialogs/SettingsDialog.vue';
import TaskLogDialog from '@frappe-local/renderer/components/dialogs/TaskLogDialog.vue';
import ErrorNotice from '@frappe-local/renderer/components/ui/ErrorNotice.vue';
import { isIpcBridgeAvailable, useFrontDoorStatus, useProgressCenter } from '@frappe-local/renderer/composables/system';
import { useAppCatalog, useBenches, useCustomApps, useSites } from '@frappe-local/renderer/composables/data';
import { useSettingsDialog } from '@frappe-local/renderer/composables/ui';

import { navigationItems } from '@frappe-local/renderer/router/routes';

import { findUnhandledFailedTask } from '@frappe-local/renderer/controllers';

const { formatTaskTitle } = useAppCatalog();
const { sites } = useSites();
const { benches } = useBenches();
const { customApps } = useCustomApps();

const getItemCount = (path: string) => {
  if (path === '/sites') return sites.value.length;
  if (path === '/benches') return benches.value.length;
  if (path === '/custom-apps') return customApps.value.length;
  return null;
};

const route = useRoute();
const showIpcWarning = computed(() => !isIpcBridgeAvailable());
const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useSettingsDialog();
const isCollapsed = ref(false);
const { tasks, activeLogTaskId } = useProgressCenter();
const { isFrontDoorAvailable } = useFrontDoorStatus();
const handledFailureTaskIds = new Set(
  tasks.value
    .filter((task) => task.type === 'task.failed')
    .map((task) => task.taskId)
);
const updateState = ref<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
const updateVersion = ref<string>('');
const appVersion = __APP_VERSION__;

const dismissUpdate = () => {
  updateState.value = 'idle';
};

const triggerDownload = async () => {
  updateState.value = 'downloading';
  try {
    await window.frappeLocal?.downloadUpdate?.();
  } catch {
    toast.error('Failed to download update package.');
    updateState.value = 'available';
  }
};

const isInstalling = ref(false);

const triggerInstall = async () => {
  if (isInstalling.value) return;
  isInstalling.value = true;
  try {
    await window.frappeLocal?.installUpdate?.();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to install update.';
    toast.error(msg);
    isInstalling.value = false;
  }
};

const selectedTaskLog = computed(() => {
  if (!activeLogTaskId.value) return null;
  return tasks.value.find((task) => task.taskId === activeLogTaskId.value) ?? null;
});

watch(
  tasks,
  (items) => {
    const task = findUnhandledFailedTask(items, handledFailureTaskIds);

    if (!task) return;

    handledFailureTaskIds.add(task.taskId);
    toast.error(`${formatTaskTitle(task.taskName)} failed.`, {
      duration: 10000,
      action: {
        label: 'View logs',
        altText: `View logs for ${formatTaskTitle(task.taskName)}`,
        onClick: () => {
          activeLogTaskId.value = task.taskId;
        },
      },
    });
  },
  { deep: true }
);

const iconComponentMap: Record<string, Component> = {
  '/activity': IconActivity,
  '/benches': IconPackage,
  '/sites': IconGlobe,
  '/custom-apps': IconBlocks,
  '/diagnostics': IconZap,
};

const mainNavItems = computed(() =>
  navigationItems.filter((item) => item.path !== '/settings')
);

onMounted(async () => {
  window.frappeLocal?.onUpdateAvailable?.((version) => {
    if (!version || version === appVersion) return;
    updateVersion.value = version;
    if (updateState.value === 'idle') updateState.value = 'available';
  });

  window.frappeLocal?.onUpdateDownloading?.(() => {
    updateState.value = 'downloading';
  });

  window.frappeLocal?.onUpdateDownloaded?.((version) => {
    updateVersion.value = version;
    updateState.value = 'downloaded';
    isInstalling.value = false;
  });

  window.frappeLocal?.onUpdateError?.((errorMsg) => {
    toast.error(`Update failed: ${errorMsg}`);
    if (updateState.value === 'downloading') {
      updateState.value = 'available';
    } else if (updateState.value !== 'available' || !updateVersion.value) {
      updateState.value = 'idle';
    }
    isInstalling.value = false;
  });

  try {
    await window.frappeLocal?.getSettings();
  } catch {
    // The inline warning already covers a missing preload bridge.
  } finally {
    await window.frappeLocal?.uiReady();
  }
});
</script>
