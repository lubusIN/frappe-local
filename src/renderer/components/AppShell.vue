<template>
  <div class="flex flex-col w-screen h-screen overflow-hidden bg-surface-base">
    <!-- Main Content Area -->
    <div class="flex flex-1 min-h-0">
      <Sidebar
        v-model:collapsed="isCollapsed"
        :sections="sidebarSections"
        class="border-r border-outline-gray-1"
      >
        <template #header>
          <div
            class="flex items-center p-3 pt-8 transition-all duration-300 [-webkit-app-region:drag]"
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
        </template>
        
        <template #footer-items>
          <Alert
            v-if="!isFrontDoorAvailable"
            class="mx-2 mb-2 transition-all duration-300"
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

          <SidebarItem
            label="Settings"
            :icon="IconSettings"
            @click="openSettings"
          />
        </template>
      </Sidebar>

      <div class="flex flex-col flex-1 min-w-0 bg-surface-base">
        <header 
          class="flex items-center justify-between px-8 py-5 border-b border-outline-gray-1 shrink-0 [-webkit-app-region:drag]"
        >
          <h1 class="text-xl-medium truncate text-ink-gray-9">
            {{ currentTitle }}
          </h1>
          
          <div
            v-if="headerActions.length > 0"
            class="flex items-center gap-3 [-webkit-app-region:no-drag]"
          >
            <Button
              v-for="action in headerActions"
              :key="action.id"
              :variant="action.variant === 'primary' ? 'solid' : 'subtle'"
              :theme="action.theme"
              :disabled="action.disabled"
              :loading="action.loading"
              :icon-left="action.icon"
              @click="action.onClick"
            >
              {{ action.label }}
            </Button>
          </div>
        </header>

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

        <main class="flex-1 p-8 overflow-y-auto">
          <RouterView />
        </main>
      </div>
    </div>

    <SettingsDialog
      :open="isSettingsOpen"
      @close="closeSettings"
    />

    <TaskLogDialog
      v-if="selectedFailedTask"
      :task="selectedFailedTask"
      @close="selectedFailedTaskId = null"
    />
  </div>
</template>

<script setup lang="ts">
import { Alert, Button, Sidebar, SidebarItem, toast } from 'frappe-ui';
import IconSettings from '~icons/lucide/settings';
import IconHome from '~icons/lucide/home';
import IconActivity from '~icons/lucide/activity';
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import IconZap from '~icons/lucide/zap';
import IconBlocks from '~icons/lucide/blocks';
import { computed, onMounted, ref, type Component, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppLogo from '@frappe-local/renderer/components/ui/AppLogo.vue';
import SettingsDialog from '@frappe-local/renderer/components/dialogs/SettingsDialog.vue';
import TaskLogDialog from '@frappe-local/renderer/components/dialogs/TaskLogDialog.vue';
import ErrorNotice from '@frappe-local/renderer/components/ui/ErrorNotice.vue';
import { isIpcBridgeAvailable, useFrontDoorStatus, useProgressCenter } from '@frappe-local/renderer/composables/system';
import { usePageHeaderActions, useSettingsDialog } from '@frappe-local/renderer/composables/ui';

import { navigationItems } from '@frappe-local/renderer/router/routes';

import { findUnhandledFailedTask } from '@frappe-local/renderer/controllers';

const route = useRoute();
const showIpcWarning = computed(() => !isIpcBridgeAvailable());
const { actions: headerActions } = usePageHeaderActions();
const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useSettingsDialog();
const isCollapsed = ref(false);
const { tasks } = useProgressCenter();
const { isFrontDoorAvailable } = useFrontDoorStatus();
const handledFailureTaskIds = new Set(
  tasks.value
    .filter((task) => task.type === 'task.failed')
    .map((task) => task.taskId)
);
const selectedFailedTaskId = ref<string | null>(null);
const appVersion = __APP_VERSION__;

const selectedFailedTask = computed(() => {
  if (!selectedFailedTaskId.value) return null;
  return tasks.value.find((task) => task.taskId === selectedFailedTaskId.value) ?? null;
});

watch(
  tasks,
  (items) => {
    const task = findUnhandledFailedTask(items, handledFailureTaskIds);

    if (!task) return;

    handledFailureTaskIds.add(task.taskId);
    toast.error(`${task.taskName} failed.`, {
      duration: 10000,
      action: {
        label: 'View logs',
        altText: `View logs for ${task.taskName}`,
        onClick: () => {
          selectedFailedTaskId.value = task.taskId;
        },
      },
    });
  },
  { deep: true }
);

const iconComponentMap: Record<string, Component> = {
  '/': IconHome,
  '/activity': IconActivity,
  '/benches': IconPackage,
  '/sites': IconGlobe,
  '/custom-apps': IconBlocks,
  '/diagnostics': IconZap,
};

const mainNavItems = computed(() =>
  navigationItems.filter((item) => item.path !== '/settings')
);

const sidebarSections = computed(() => [
  {
    items: mainNavItems.value.map((item) => ({
      label: item.label,
      icon: iconComponentMap[item.path] || IconHome,
      to: item.path,
      isActive: route.path === item.path,
    })),
  },
]);

const currentTitle = computed(() => String(route.meta.title ?? 'Frappe Local'));

onMounted(async () => {
  try {
    await window.frappeLocal?.getSettings();
  } catch {
    // The inline warning already covers a missing preload bridge.
  } finally {
    await window.frappeLocal?.uiReady();
  }
});
</script>
