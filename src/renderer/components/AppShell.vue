<template>
  <main class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-logo">
          <svg viewBox="0 0 24 24" class="sidebar-logo__icon" aria-hidden="true">
            <path d="M7 14c-1.66 0-3-1.34-3-3 0-1.52 1.13-2.77 2.6-2.97C7.3 5.67 9.44 4 12 4c3.2 0 5.82 2.52 5.99 5.68A3.5 3.5 0 0 1 17.5 17H8" />
          </svg>
        </div>
        <div class="sidebar-brand__text">
          <span class="sidebar-brand__label">Frappe Cloud</span>
          <span class="sidebar-brand__user">local@frappe.cafe</span>
        </div>
        <button
          type="button"
          class="sidebar-brand__menu"
          aria-label="Menu"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
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
            <svg viewBox="0 0 24 24" class="sidebar-item__svg">
              <path v-for="segment in item.iconPaths" :key="segment" :d="segment" />
            </svg>
          </span>
          <span class="sidebar-item__label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-divider"></div>

      <div class="sidebar-bottom">
        <RouterLink to="/settings" class="sidebar-item" title="Settings">
          <span class="sidebar-item__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="sidebar-item__svg">
              <path d="M12 8.5A3.5 3.5 0 1112 15.5 3.5 3.5 0 0112 8.5z" />
              <path d="M19.4 15a1 1 0 00.2 1.1l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1 1 0 00-1.1-.2 1 1 0 00-.6.9V20a2 2 0 01-4 0v-.2a1 1 0 00-.7-.9 1 1 0 00-1.1.2l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1 1 0 00.2-1.1 1 1 0 00-.9-.6H4a2 2 0 010-4h.2a1 1 0 00.9-.7 1 1 0 00-.2-1.1l-.1-.1a2 2 0 012.8-2.8l.1.1a1 1 0 001.1.2 1 1 0 00.6-.9V4a2 2 0 014 0v.2a1 1 0 00.7.9 1 1 0 001.1-.2l.1-.1a2 2 0 012.8 2.8l-.1.1a1 1 0 00-.2 1.1 1 1 0 00.9.6H20a2 2 0 010 4h-.2a1 1 0 00-.9.7z" />
            </svg>
          </span>
          <span class="sidebar-item__label">Settings</span>
        </RouterLink>
      </div>
    </aside>

    <section class="content">
      <header class="page-header">
        <div class="page-header__top">
          <div class="page-header__breadcrumb">
            <span class="breadcrumb__segment">Local Workspace</span>
            <span class="breadcrumb__separator">/</span>
            <span class="breadcrumb__segment breadcrumb__segment--current">{{ currentTitle }}</span>
          </div>
          <div class="page-header__actions">
            <RouterLink class="header-btn" to="/settings">Preferences</RouterLink>
            <RouterLink class="header-btn header-btn--primary" to="/sites">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="8" cy="8" r="6" />
              </svg>
              Visit Sites
            </RouterLink>
            <button class="header-btn header-btn--icon" aria-label="More options">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="page-header__title-row">
          <h1 class="page-header__title">{{ currentTitle }}</h1>
          <span class="status-badge" :class="entityStatusClass">{{ entityStatusLabel }}</span>
        </div>
      </header>

      <nav v-if="showDashboardTabs" class="page-tabs" aria-label="Dashboard sections">
        <RouterLink
          v-for="tab in dashboardTabs"
          :key="tab.hash"
          class="page-tab"
          :class="{ 'page-tab--active': activeDashboardHash === tab.hash }"
          :to="{ path: '/', hash: tab.hash }"
        >
          <svg viewBox="0 0 24 24" class="page-tab__icon" aria-hidden="true">
            <path v-for="segment in tab.iconPaths" :key="segment" :d="segment" />
          </svg>
          {{ tab.label }}
        </RouterLink>
      </nav>

      <section v-if="showIpcWarning" class="ipc-warning" role="alert">
        <div class="ipc-warning__icon">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
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
import { isIpcBridgeAvailable } from '../composables/useIpc';
import type { SettingsItem } from '../../shared/ipc';
import { navigationItems } from '../routes';

type IconDefinition = {
  readonly iconPaths: readonly string[];
};

const route = useRoute();
const settingsLoaded = ref(false);
const showIpcWarning = computed(() => !isIpcBridgeAvailable());

const iconMap: Record<string, IconDefinition> = {
  '/': {
    iconPaths: ['M4 10.5L12 4l8 6.5', 'M6.5 9.5V20h11V9.5', 'M10 20v-5h4v5'],
  },
  '/benches': {
    iconPaths: ['M4 7h16', 'M6 7V5h12v2', 'M5 7v10h14V7', 'M9 11h6', 'M9 14h4'],
  },
  '/sites': {
    iconPaths: ['M12 4a7 7 0 100 14 7 7 0 000-14z', 'M12 4c2.5 2.2 4 5 4 7s-1.5 4.8-4 7', 'M12 4c-2.5 2.2-4 5-4 7s1.5 4.8 4 7', 'M5 11h14'],
  },
  '/workspaces': {
    iconPaths: ['M4 5h7v6H4z', 'M13 5h7v4h-7z', 'M13 11h7v8h-7z', 'M4 13h7v6H4z'],
  },
  '/console': {
    iconPaths: ['M5 6l5 6-5 6', 'M12 18h7', 'M4 4h16v16H4z'],
  },
  '/import-export': {
    iconPaths: ['M12 4v11', 'M8 11l4 4 4-4', 'M5 19h14', 'M12 20V9'],
  },
  '/settings': {
    iconPaths: [
      'M12 8.5A3.5 3.5 0 1112 15.5 3.5 3.5 0 0112 8.5z',
      'M19.4 15a1 1 0 00.2 1.1l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1 1 0 00-1.1-.2 1 1 0 00-.6.9V20a2 2 0 01-4 0v-.2a1 1 0 00-.7-.9 1 1 0 00-1.1.2l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1 1 0 00.2-1.1 1 1 0 00-.9-.6H4a2 2 0 010-4h.2a1 1 0 00.9-.7 1 1 0 00-.2-1.1l-.1-.1a2 2 0 012.8-2.8l.1.1a1 1 0 001.1.2 1 1 0 00.6-.9V4a2 2 0 014 0v.2a1 1 0 00.7.9 1 1 0 001.1-.2l.1-.1a2 2 0 012.8 2.8l-.1.1a1 1 0 00-.2 1.1 1 1 0 00.9.6H20a2 2 0 010 4h-.2a1 1 0 00-.9.7z',
    ],
  },
};

// Filter out settings from main nav since it's in sidebar bottom
const mainNavItems = computed(() =>
  navigationItems.filter((item) => item.path !== '/settings')
);

const navigationWithIcons = computed(() =>
  mainNavItems.value.map((item) => ({
    ...item,
    iconPaths: iconMap[item.path]?.iconPaths ?? ['M5 12h14'],
  }))
);

const currentTitle = computed(() => String(route.meta.title ?? 'Frappe Cafe'));
const dashboardTabs = [
  { label: 'Overview', hash: '#overview', iconPaths: ['M4 5h16v14H4z', 'M9 5v14', 'M4 10h16'] },
  { label: 'Runtime', hash: '#runtime', iconPaths: ['M12 3v5', 'M12 16v5', 'M4.9 4.9l3.5 3.5', 'M15.6 15.6l3.5 3.5', 'M3 12h5', 'M16 12h5', 'M4.9 19.1l3.5-3.5', 'M15.6 8.4l3.5-3.5'] },
  { label: 'Activity', hash: '#activity', iconPaths: ['M4 16l4-5 4 3 4-7 4 4', 'M4 20h16'] },
  { label: 'Shortcuts', hash: '#shortcuts', iconPaths: ['M8 7h8', 'M7 12h10', 'M9 17h6', 'M4 4h16v16H4z'] },
] as const;
const showDashboardTabs = computed(() => route.path === '/');
const activeDashboardHash = computed(() => route.hash || '#overview');
const entityStatusLabel = computed(() => (showIpcWarning.value ? 'Unavailable' : 'Active'));
const entityStatusClass = computed(() =>
  showIpcWarning.value ? 'status-badge--danger' : 'status-badge--success'
);

const buildDefaultSettings = (): SettingsItem => ({
  defaultFrappeVersion: '15.0.0',
  runtimePreference: 'docker',
  storagePath: '~/Library/Application Support/Frappe Cafe',
  terminalPreference: 'zsh',
  editorPreference: 'code',
  updateChannel: 'stable',
  autoUpdateEnabled: true,
  sidebarCompact: false,
});

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
}

.sidebar-logo__icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
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

.sidebar-brand__user {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-brand__menu {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  padding: 0;
}

.sidebar-brand__menu:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
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
  width: 18px;
  height: 18px;
  min-width: 18px;
  color: currentColor;
  opacity: 0.7;
}

.sidebar-item.router-link-exact-active .sidebar-item__icon,
.sidebar-item.router-link-active .sidebar-item__icon {
  opacity: 1;
}

.sidebar-item__svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
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
   Page Header — Frappe Cloud style
   ============================================================ */

.page-header {
  padding: 16px 24px 0;
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-light);
}

.page-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.page-header__breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.breadcrumb__segment {
  color: var(--text-secondary);
}

.breadcrumb__segment--current {
  color: var(--text-primary);
  font-weight: 500;
}

.breadcrumb__separator {
  color: var(--text-muted);
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  text-decoration: none;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease, border-color 100ms ease;
}

.header-btn:hover {
  background: var(--surface-hover);
}

.header-btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-text);
}

.header-btn--primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

.header-btn--icon {
  padding: 0;
  width: 28px;
  height: 28px;
  justify-content: center;
}

.page-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 16px;
}

.page-header__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

/* Status badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.status-badge--success {
  color: var(--green-text);
  background: var(--green-light);
}

.status-badge--danger {
  color: var(--red-text);
  background: var(--red-light);
}

/* ============================================================
   Page Tabs — Frappe Cloud style
   ============================================================ */

.page-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 24px;
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-light);
}

.page-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  color: var(--text-secondary);
  text-decoration: none;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 100ms ease, border-color 100ms ease;
}

.page-tab:hover {
  color: var(--text-primary);
}

.page-tab--active {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}

.page-tab__icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
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

@media (max-width: 960px) {
  .page-header__top {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>