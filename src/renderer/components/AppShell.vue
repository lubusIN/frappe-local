<template>
  <main class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-logo">
          <svg viewBox="0 0 24 24" class="sidebar-logo__icon" aria-hidden="true">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
          </svg>
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
        <div class="page-header__title-row">
          <h1 class="page-header__title">{{ currentTitle }}</h1>
        </div>
      </header>

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
  gap: 10px;
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