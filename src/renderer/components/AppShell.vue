<template>
  <div class="flex h-screen w-screen overflow-hidden">
    <Sidebar
      v-model:collapsed="isCollapsed"
      :sections="sidebarSections"
    >
      <template #header>
        <div
          class="flex items-center p-3 transition-all duration-300"
          :class="isCollapsed ? 'justify-center' : ''"
        >
          <div class="w-8 h-8 rounded-md bg-[#171717] text-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            <CafeLogo class="w-4 h-4" />
          </div>
          <div 
            v-if="!isCollapsed"
            class="ml-3 flex flex-col truncate transition-all duration-300"
          >
            <span class="text-sm font-bold text-gray-900 leading-tight">Frappe Cafe</span>
            <span class="text-xs text-gray-500 font-medium leading-tight mt-0.5">local dev</span>
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

    <div class="flex-1 flex flex-col min-w-0 bg-white">
      <header class="flex items-center justify-between px-8 py-5 border-b border-gray-100 shrink-0">
        <h1 class="text-lg text-gray-900 font-medium truncate">{{ currentTitle }}</h1>
        
        <div v-if="headerActions.length > 0" class="flex items-center gap-3">
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

      <div v-if="showIpcWarning" class="mx-6 mt-4 p-3 rounded-lg border border-red-100 bg-red-50/50 flex items-start gap-3 shrink-0">
        <IconAlertTriangle class="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
        <div class="min-w-0">
          <h3 class="text-xs font-bold text-red-700">Desktop services unavailable</h3>
          <p class="text-xs text-red-600/80 leading-relaxed mt-0.5">
            Preload bridge failed. Runtime actions will be unavailable until the connection is restored.
          </p>
        </div>
      </div>

      <main class="flex-1 overflow-y-auto p-8">
        <RouterView />
      </main>
    </div>

    <SettingsDialog :open="isSettingsOpen" @close="closeSettings" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { Sidebar, SidebarItem, Button } from 'frappe-ui';
import IconHome from '~icons/lucide/home';
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import IconActivity from '~icons/lucide/activity';
import IconSettings from '~icons/lucide/settings';
import IconZap from '~icons/lucide/zap';
import IconChevronLeft from '~icons/lucide/chevron-left';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconAlertTriangle from '~icons/lucide/alert-triangle';
import CafeLogo from './CafeLogo.vue';
import SettingsDialog from './SettingsDialog.vue';
import { isIpcBridgeAvailable } from '../composables/useIpc';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import { useSettingsDialog } from '../composables/useSettingsDialog';
import { navigationItems } from '../routes';

const route = useRoute();
const showIpcWarning = computed(() => !isIpcBridgeAvailable());
const { actions: headerActions, clearActions } = usePageHeaderActions();
const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useSettingsDialog();
const isCollapsed = ref(false);

const iconComponentMap: Record<string, any> = {
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

const currentTitle = computed(() => String(route.meta.title ?? 'Frappe Cafe'));

onMounted(async () => {
  try {
    await window.frappeCafe?.getSettings();
  } catch {}
});
</script>

<style scoped>
/* No custom CSS required - relying on Tailwind and Frappe UI native layouts */
</style>