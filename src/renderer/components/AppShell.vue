<template>
  <div class="flex w-screen h-screen overflow-hidden">
    <Sidebar
      v-model:collapsed="isCollapsed"
      :sections="sidebarSections"
    >
      <template #header>
        <div
          class="flex items-center p-3 transition-all duration-300"
          :class="isCollapsed ? 'justify-center' : ''"
        >
          <div class="flex items-center justify-center w-8 h-8 overflow-hidden rounded-md shadow-sm bg-surface-gray-7 text-ink-white shrink-0">
            <Logo class="w-5 h-5 text-ink-white" />
          </div>
          <div 
            v-if="!isCollapsed"
            class="flex flex-col ml-3 truncate transition-all duration-300"
          >
            <span class="text-sm font-bold leading-tight text-ink-gray-9">Local Bench</span>
            <span class="text-xs text-ink-gray-5 font-medium leading-tight mt-0.5">frappe for humans</span>
          </div>
        </div>
      </template>
      
      <template #footer-items>
        <SidebarItem
          label="Settings"
          :icon="IconSettings"
          @click="openSettings"
        />
      </template>
    </Sidebar>

    <div class="flex flex-col flex-1 min-w-0 bg-surface-white">
      <header class="flex items-center justify-between px-8 py-5 border-b border-outline-gray-1 shrink-0">
        <h1 class="text-lg font-medium truncate text-ink-gray-9">
          {{ currentTitle }}
        </h1>
        
        <div
          v-if="headerActions.length > 0"
          class="flex items-center gap-3"
        >
          <Button
            v-for="action in headerActions"
            :key="action.id"
            :variant="action.variant === 'primary' ? 'solid' : 'subtle'"
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

    <SettingsDialog
      :open="isSettingsOpen"
      @close="closeSettings"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { Sidebar, SidebarItem, Button } from 'frappe-ui';
import IconHome from '~icons/lucide/home';
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import IconActivity from '~icons/lucide/activity';
import IconSettings from '~icons/lucide/settings';
import IconZap from '~icons/lucide/zap';
import Logo from './ui/Logo.vue';
import SettingsDialog from './dialogs/SettingsDialog.vue';
import ErrorNotice from './ui/ErrorNotice.vue';
import { isIpcBridgeAvailable } from '../composables/system/useIpc';
import { usePageHeaderActions } from '../composables/ui/usePageHeaderActions';
import { useSettingsDialog } from '../composables/ui/useSettingsDialog';
import { navigationItems } from '../router/routes';

const route = useRoute();
const showIpcWarning = computed(() => !isIpcBridgeAvailable());
const { actions: headerActions } = usePageHeaderActions();
const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useSettingsDialog();
const isCollapsed = ref(false);

const iconComponentMap: Record<string, Component> = {
  '/': IconHome,
  '/activity': IconActivity,
  '/benches': IconPackage,
  '/sites': IconGlobe,
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

const currentTitle = computed(() => String(route.meta.title ?? 'Local Bench'));

onMounted(async () => {
  try {
    await window.localBench?.getSettings();
  } catch {
    // The inline warning already covers a missing preload bridge.
  }
});
</script>
