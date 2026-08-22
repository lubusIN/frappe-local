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
            class="flex items-center mx-2 p-3 transition-all duration-300 [-webkit-app-region:drag]"
            :class="[
              isCollapsed ? 'justify-center' : '',
              isWinOrLinux ? 'pt-3' : 'pt-8'
            ]"
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
                :icon="iconComponentMap[item.path] || 'lucide-globe'"
                :to="item.path"
                :active="item.path === '/sites' ? (route.path === '/' || route.path.startsWith('/sites')) : route.path.startsWith(item.path)"
              >
                <template
                  v-if="item.path === '/diagnostics' && report"
                  #suffix
                >
                  <div class="flex items-center justify-center shrink-0 mr-1.5">
                    <i
                      v-if="report.hasCriticalIssues"
                      class="lucide-x text-red-500 size-[14px]"
                    />
                    <i
                      v-else-if="report.hasWarnings"
                      class="lucide-alert-triangle text-amber-500 size-[14px]"
                    />
                    <i
                      v-else
                      class="lucide-check text-green-500 size-[14px]"
                    />
                  </div>
                </template>
                <template
                  v-else-if="getItemCount(item.path) !== null && getItemCount(item.path)! > 0"
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
              theme="amber"
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
              :icon="'lucide-settings'"
              :active="isSettingsOpen"
              @click="openSettings"
            />
            <SidebarItem
              :label="isCollapsed ? 'Expand' : 'Collapse'"
              @click="isCollapsed = !isCollapsed"
            >
              <template #prefix>
                <i
                  class="lucide-panel-right-open size-4 text-ink-gray-6 transition-transform duration-300 ease-in-out"
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
          reason: 'Preload bridge failed. Runtime actions will be unavailable until the connection is restored.',
          steps: [],
          actions: [],
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
    <!-- Full Screen WSL Blocking Overlay -->
    <div
      v-if="wslBlocked"
      class="fixed inset-0 z-50 flex items-center justify-center bg-surface-base/95 backdrop-blur-md p-6 [-webkit-app-region:drag]"
    >
      <div class="max-w-md w-full flex flex-col items-center text-center [-webkit-app-region:no-drag]">
        <div class="mb-6 flex items-center justify-center scale-125">
          <AppLogo />
        </div>

        <Alert
          :theme="wslNeedsRestart ? 'blue' : 'red'"
          :title="wslNeedsRestart ? 'System Restart Required' : 'WSL2 Virtualization Missing'"
          :dismissible="false"
          variant="outline"
          class="w-full text-left"
        >
          <template #footer>
            <div class="col-span-full -mt-1 flex flex-col gap-3">
              <p class="text-xs text-ink-gray-7 leading-normal">
                {{ wslNeedsRestart 
                  ? 'Windows Subsystem for Linux (WSL2) has been installed successfully. You must restart your computer before Frappe Local can run containers.' 
                  : 'Frappe Local requires Windows Subsystem for Linux (WSL2) to run containerized environments on Windows.' }}
              </p>

              <p
                v-if="wslError"
                class="text-xs text-ink-red-7 bg-surface-red-1 p-2 rounded-4 border border-outline-red-2 break-words"
              >
                {{ wslError }}
              </p>

              <Button
                v-if="!wslNeedsRestart"
                variant="solid"
                theme="gray"
                size="sm"
                class="w-full mt-1"
                :loading="wslInstalling"
                :disabled="wslInstalling"
                @click="handleWslOneClickFix"
              >
                {{ wslInstalling ? 'Installing WSL...' : 'Install' }}
              </Button>

              <div
                v-if="wslInstallTask"
                class="mt-2 w-full overflow-hidden rounded-5 bg-surface-base border border-outline-gray-2 flex flex-col text-left"
              >
                <div class="px-3 py-1.5 border-b border-outline-gray-2 bg-surface-gray-1 flex items-center justify-between">
                  <span class="text-[11px] font-medium text-ink-gray-6 uppercase tracking-wider">Installation Log</span>
                  <LoadingIndicator
                    v-if="wslInstallTask.status === 'running' || wslInstallTask.status === 'queued'"
                    class="size-3 text-ink-blue-4"
                  />
                </div>
                <div
                  ref="wslLogsContainer"
                  class="p-3 h-32 overflow-y-auto font-mono text-[10px] leading-relaxed text-ink-gray-7 cursor-text select-text whitespace-pre-wrap break-words"
                >
                  <div
                    v-for="(log, idx) in wslInstallTask.logs"
                    :key="idx"
                    :class="{'text-ink-red-5': log.level === 'error'}"
                  >
                    {{ log.message }}
                  </div>
                  <div
                    v-if="!wslInstallTask.logs?.length"
                    class="text-ink-gray-4 italic"
                  >
                    Waiting for output...
                  </div>
                </div>
              </div>

              <Button
                v-if="wslNeedsRestart"
                variant="solid"
                theme="gray"
                size="sm"
                class="w-full mt-1"
                @click="handleSystemRestart"
              >
                Restart Now
              </Button>
            </div>
          </template>
        </Alert>
      </div>
    </div>
  </DesktopShell>
</template>

<script setup lang="ts">
import { Alert, Badge, Button, DesktopShell, ScrollArea, Sidebar, SidebarItem, toast, LoadingIndicator } from 'frappe-ui';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppLogo from '@frappe-local/renderer/components/ui/AppLogo.vue';
import SettingsDialog from '@frappe-local/renderer/components/dialogs/SettingsDialog.vue';
import TaskLogDialog from '@frappe-local/renderer/components/dialogs/TaskLogDialog.vue';
import ErrorNotice from '@frappe-local/renderer/components/ui/ErrorNotice.vue';
import { handledFailureTaskIds, isIpcBridgeAvailable, useFrontDoorStatus, useProgressCenter, useDiagnostics } from '@frappe-local/renderer/composables/system';
import { useAppCatalog, useBenches, useCustomApps, useSites } from '@frappe-local/renderer/composables/data';
import { useSettingsDialog } from '@frappe-local/renderer/composables/ui';

import { navigationItems } from '@frappe-local/renderer/router/routes';

import { findUnhandledCancelledTask, findUnhandledFailedTask } from '@frappe-local/renderer/controllers';

const { formatTaskTitle } = useAppCatalog();
const { sites } = useSites();
const { benches } = useBenches();
const { customApps } = useCustomApps();
const { report } = useDiagnostics();

const isCollapsed = ref(false);

const getItemCount = (path: string) => {
  if (path === '/sites') return sites.value.length;
  if (path === '/benches') return benches.value.length;
  if (path === '/custom-apps') return customApps.value.length;
  return null;
};

const route = useRoute();
const isWinOrLinux = computed(() => {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('win') || ua.includes('linux');
});
const showIpcWarning = computed(() => !isIpcBridgeAvailable());
const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useSettingsDialog();
const { tasks, activeLogTaskId } = useProgressCenter();
const { isFrontDoorAvailable } = useFrontDoorStatus();

const wslBlocked = ref(false);
const wslInstalling = ref(false);
const wslNeedsRestart = ref(false);
const wslError = ref<string | null>(null);
const wslInstallTaskId = ref<string | null>(null);
const wslInstallTask = computed(() => wslInstallTaskId.value ? tasks.value.find(t => t.taskId === wslInstallTaskId.value) : null);
const wslLogsContainer = ref<HTMLElement | null>(null);

watch(() => wslInstallTask.value?.logs?.length, () => {
  if (wslLogsContainer.value) {
    wslLogsContainer.value.scrollTop = wslLogsContainer.value.scrollHeight;
  }
});

watch(() => wslInstallTask.value?.status, (status) => {
  if (status === 'success') {
    wslInstalling.value = false;
    localStorage.setItem('frappe_local_wsl_pending_restart', 'true');
    wslNeedsRestart.value = true;
  } else if (status === 'failure') {
    wslInstalling.value = false;
    wslError.value = 'Installation failed. Administrator permissions may have been denied or an error occurred.';
  }
});

const handleWslOneClickFix = async () => {
  wslInstalling.value = true;
  wslError.value = null;
  wslInstallTaskId.value = null;
  try {
    const result = await window.frappeLocal?.fixRuntime('wsl');
    if (typeof result === 'string') {
      wslInstallTaskId.value = result;
      // Let the watch handle completion
    } else if (result === true) {
      // Fallback
      localStorage.setItem('frappe_local_wsl_pending_restart', 'true');
      wslNeedsRestart.value = true;
      wslInstalling.value = false;
    } else {
      wslError.value = 'Installation cancelled or failed.';
      wslInstalling.value = false;
    }
  } catch (err) {
    wslError.value = err instanceof Error ? err.message : String(err);
    wslInstalling.value = false;
  }
};

const handleSystemRestart = async () => {
  try {
    await window.frappeLocal?.fixRuntime('system-restart');
  } catch {
    // ignore
  }
};
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
    const failedTask = findUnhandledFailedTask(items, handledFailureTaskIds);
    if (failedTask) {
      handledFailureTaskIds.add(failedTask.taskId);
      toast.error(`${formatTaskTitle(failedTask.taskName)} failed.`, {
        duration: 10000,
        action: {
          label: 'View logs',
          altText: `View logs for ${formatTaskTitle(failedTask.taskName)}`,
          onClick: () => {
            activeLogTaskId.value = failedTask.taskId;
          },
        },
      });
    }

    const cancelledTask = findUnhandledCancelledTask(items, handledFailureTaskIds);
    if (cancelledTask) {
      handledFailureTaskIds.add(`cancelled:${cancelledTask.taskId}`);
      toast.info(`${formatTaskTitle(cancelledTask.taskName)} cancelled.`);
    }
  },
  { deep: true }
);

const iconComponentMap: Record<string, string> = {
  '/activity': 'lucide-activity',
  '/benches': 'lucide-boxes',
  '/sites': 'lucide-app-window',
  '/custom-apps': 'lucide-blocks',
  '/diagnostics': 'lucide-zap',
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
    if (navigator.userAgent.toLowerCase().includes('win')) {
      const report = await window.frappeLocal?.runDiagnostics();
      const wslCheck = report?.checks?.find((check) => check.title.includes('Windows Subsystem') || check.title.includes('WSL'));
      if (wslCheck && wslCheck.status === 'failed') {
        wslBlocked.value = true;
        if (localStorage.getItem('frappe_local_wsl_pending_restart') === 'true') {
          wslNeedsRestart.value = true;
        }
      } else if (wslCheck && wslCheck.status === 'passed') {
        localStorage.removeItem('frappe_local_wsl_pending_restart');
        wslBlocked.value = false;
      }
    }
  } catch {
    // The inline warning already covers a missing preload bridge.
  } finally {
    await window.frappeLocal?.uiReady();
  }
});
</script>
