<template>
  <main class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-logo">
          <IconCalendar class="sidebar-logo__icon" />
        </div>
        <div class="sidebar-brand__text">
          <span class="sidebar-brand__label">Frappe Cafe</span>
        </div>
      </div>

      <nav aria-label="Primary" class="sidebar-nav">
        <RouterLink
          v-for="item in navigationWithIcons"
          :key="item.path"
          :to="item.path"
          class="sidebar-item"
          :title="item.label"
        >
          <span class="sidebar-item__icon" aria-hidden="true">
            <component :is="item.icon" class="sidebar-item__svg" />
          </span>
          <span class="sidebar-item__label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-divider"></div>

      <div class="sidebar-bottom">
        <RouterLink to="/settings" class="sidebar-item" title="Settings">
          <span class="sidebar-item__icon" aria-hidden="true">
            <IconSettings class="sidebar-item__svg" />
          </span>
          <span class="sidebar-item__label">Settings</span>
        </RouterLink>
      </div>
    </aside>

    <section class="content">
      <header class="page-header">
        <div class="page-header__title-row">
          <h1 class="page-header__title">{{ currentTitle }}</h1>
          <div v-if="headerActions.length > 0" class="page-header__actions">
            <button
              v-for="action in headerActions"
              :key="action.id"
              type="button"
              class="page-header__btn"
              :class="{
                'page-header__btn--primary': action.variant === 'primary',
              }"
              :disabled="Boolean(action.disabled)"
              @click="action.onClick"
            >
              <component
                v-if="action.icon"
                :is="action.icon"
                class="page-header__btn-icon"
                aria-hidden="true"
              />
              {{ action.label }}
            </button>
          </div>
        </div>
      </header>

      <section v-if="showIpcWarning" class="ipc-warning" role="alert">
        <div class="ipc-warning__icon">
          <IconAlertTriangle class="ipc-warning__icon-svg" />
        </div>
        <div>
          <h3 class="ipc-warning__title">Desktop services are unavailable</h3>
          <p class="ipc-warning__body">
            The preload bridge did not initialize. Runtime-backed actions will show an error until the Electron preload connection is fixed.
          </p>
        </div>
      </section>

      <section class="page-body">
        <RouterView />
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import IconHome from '~icons/lucide/home';
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import IconLayoutGrid from '~icons/lucide/layout-grid';
import IconTerminal from '~icons/lucide/terminal';
import IconArrowRightLeft from '~icons/lucide/arrow-right-left';
import IconSettings from '~icons/lucide/settings';
import IconZap from '~icons/lucide/zap';
import IconCalendar from '~icons/lucide/calendar';
import IconAlertTriangle from '~icons/lucide/alert-triangle';
import { isIpcBridgeAvailable } from '../composables/useIpc';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import { navigationItems } from '../routes';

const route = useRoute();
const settingsLoaded = ref(false);
const showIpcWarning = computed(() => !isIpcBridgeAvailable());
const { actions: headerActions } = usePageHeaderActions();

const iconComponentMap: Record<string, any> = {
  '/': IconHome,
  '/benches': IconPackage,
  '/sites': IconGlobe,
  '/workspaces': IconLayoutGrid,
  '/console': IconTerminal,
  '/import-export': IconArrowRightLeft,
  '/diagnostics': IconZap,
};

// Filter out settings from main nav since it's in sidebar bottom
const mainNavItems = computed(() =>
  navigationItems.filter((item) => item.path !== '/settings')
);

const navigationWithIcons = computed(() =>
  mainNavItems.value.map((item) => ({
    ...item,
    icon: iconComponentMap[item.path] || IconHome,
  }))
);

const currentTitle = computed(() => String(route.meta.title ?? 'Frappe Cafe'));

const loadShellPreference = async (): Promise<void> => {
  try {
    await window.frappeCafe?.getSettings();
  } finally {
    settingsLoaded.value = true;
  }
};

onMounted(() => {
  void loadShellPreference();
});
</script>

<style scoped>
/* ============================================================
   Sidebar
   ============================================================ */

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #171717, #404040);
  color: #ffffff;
}

.sidebar-logo__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.sidebar-brand__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.sidebar-brand__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

/* Sidebar nav */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  flex: 1;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: background-color 100ms ease, color 100ms ease;
  border: none;
  background: transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.sidebar-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.sidebar-item.router-link-exact-active,
.sidebar-item.router-link-active {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.sidebar-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  min-width: 20px;
  color: currentColor;
  opacity: 0.7;
}

.sidebar-item__svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.sidebar-item.router-link-exact-active .sidebar-item__icon,
.sidebar-item.router-link-active .sidebar-item__icon {
  opacity: 1;
}

.sidebar-item__label {
  flex: 1;
  line-height: 1.3;
}

.sidebar-divider {
  height: 1px;
  background: var(--border-light);
  margin: 0 16px;
}

.sidebar-bottom {
  padding: 8px;
}

/* ============================================================
   Page Header
   ============================================================ */

.page-header {
  padding: 16px 24px;
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-light);
}

.page-header__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-header__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
  white-space: nowrap;
}

.page-header__btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.page-header__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.page-header__btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-text);
}

.page-header__btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.page-header__btn-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.page-header__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

/* ============================================================
   Page Body
   ============================================================ */

.page-body {
  padding: 20px 24px;
}

/* ============================================================
   IPC Warning
   ============================================================ */

.ipc-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 16px 24px 0;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--red-border);
  background: var(--red-light);
}

.ipc-warning__icon {
  color: var(--red-text);
  min-width: 16px;
  margin-top: 1px;
  display: flex;
  align-items: center;
}

.ipc-warning__icon-svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.ipc-warning__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--red-text);
}

.ipc-warning__body {
  margin: 4px 0 0;
  font-size: 13px;
  color: #9b2c2c;
  line-height: 1.5;
}

/* ============================================================
   Responsive
   ============================================================ */

</style>