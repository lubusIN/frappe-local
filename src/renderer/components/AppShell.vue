<template>
  <main class="shell" :class="{ 'shell--compact': sidebarCompact }">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="brand-row">
          <div class="product-mark" aria-label="Frappe Cafe">
            <span class="product-mark__badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="product-mark__badge-icon">
                <path d="M7 14c-1.66 0-3-1.34-3-3 0-1.52 1.13-2.77 2.6-2.97C7.3 5.67 9.44 4 12 4c3.2 0 5.82 2.52 5.99 5.68A3.5 3.5 0 0 1 17.5 17H8" />
              </svg>
            </span>
            <div>
              <p class="eyebrow">Frappe Cloud</p>
              <h1 class="brand-title">Frappe Cafe</h1>
            </div>
          </div>
          <button
            type="button"
            class="sidebar-toggle"
            :aria-pressed="sidebarCompact"
            :aria-label="sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'"
            @click="toggleSidebarCompact"
          >
            <svg viewBox="0 0 24 24" class="sidebar-toggle__icon" aria-hidden="true">
              <path :d="sidebarCompact ? 'M8 6l6 6-6 6' : 'M16 6l-6 6 6 6'" />
            </svg>
          </button>
        </div>

        <button type="button" class="workspace-switcher">
          <span class="workspace-switcher__avatar" aria-hidden="true">FC</span>
          <span class="workspace-switcher__copy">
            <strong class="workspace-switcher__name">Local Development</strong>
            <span class="workspace-switcher__meta">Desktop workspace</span>
          </span>
          <svg viewBox="0 0 24 24" class="workspace-switcher__chevron" aria-hidden="true">
            <path d="M7 10l5 5 5-5" />
          </svg>
        </button>
      </div>

      <nav aria-label="Primary" class="nav-block">
        <p class="nav-section-title">Workspace</p>
        <RouterLink
          v-for="item in navigationWithIcons"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          :title="item.label"
        >
          <span class="nav-link-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="nav-link-icon__svg">
              <path v-for="segment in item.iconPaths" :key="segment" :d="segment" />
            </svg>
          </span>
          <span class="nav-link-copy">
            <span class="nav-link-title">{{ item.label }}</span>
            <span class="nav-link-description">{{ item.description }}</span>
          </span>
        </RouterLink>
      </nav>

      <footer class="sidebar-footer">
        <div class="sidebar-footer__cluster">
          <p class="sidebar-footer__label">Environment</p>
          <p class="sidebar-footer__value">Desktop · Local runtime</p>
        </div>
        <div class="sidebar-footer__actions">
          <RouterLink class="sidebar-footer__link" to="/settings">Settings</RouterLink>
          <RouterLink class="sidebar-footer__link" to="/console">Console</RouterLink>
        </div>
      </footer>
    </aside>

    <section class="content">
      <div class="workspace-frame">
        <header class="entity-shell">
          <div class="entity-header">
            <div class="entity-header__meta">
              <p class="entity-header__context">Local Workspace / Desktop Shell / {{ currentTitle }}</p>
              <div class="entity-header__title-row">
                <h2 class="entity-header__title">{{ currentTitle }}</h2>
                <span class="entity-status" :class="entityStatusClass">{{ entityStatusLabel }}</span>
              </div>
              <p class="entity-header__body">{{ currentDescription }}</p>
            </div>
            <div class="entity-header__actions">
              <RouterLink class="entity-action" to="/settings">Preferences</RouterLink>
              <RouterLink class="entity-action entity-action--primary" to="/sites">Open Sites</RouterLink>
            </div>
          </div>

          <nav v-if="showDashboardTabs" class="entity-tabs" aria-label="Dashboard sections">
            <RouterLink
              v-for="tab in dashboardTabs"
              :key="tab.hash"
              class="entity-tab"
              :class="{ 'entity-tab--active': activeDashboardHash === tab.hash }"
              :to="{ path: '/', hash: tab.hash }"
            >
              <svg viewBox="0 0 24 24" class="entity-tab__icon" aria-hidden="true">
                <path v-for="segment in tab.iconPaths" :key="segment" :d="segment" />
              </svg>
              {{ tab.label }}
            </RouterLink>
          </nav>
        </header>

        <section v-if="showIpcWarning" class="ipc-warning" role="alert">
          <p class="ipc-warning__eyebrow">Renderer connection issue</p>
          <h3 class="ipc-warning__title">Desktop services are unavailable</h3>
          <p class="ipc-warning__body">
            The preload bridge did not initialize, so data loading and local actions cannot run yet.
            The tabs should still render, but any runtime-backed action will show an error until the Electron preload connection is fixed.
          </p>
        </section>

        <section class="workspace-frame__body">
          <RouterView />
        </section>
      </div>
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
const sidebarCompact = ref(false);
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

const navigationWithIcons = computed(() =>
  navigationItems.map((item) => ({
    ...item,
    iconPaths: iconMap[item.path]?.iconPaths ?? ['M5 12h14'],
  }))
);

const currentTitle = computed(() => String(route.meta.title ?? 'Frappe Cafe'));
const currentDescription = computed(() =>
  String(route.meta.description ?? 'The desktop shell is ready for the next feature slice.')
);
const dashboardTabs = [
  { label: 'Overview', hash: '#overview', iconPaths: ['M4 5h16v14H4z', 'M9 5v14', 'M4 10h16'] },
  { label: 'Runtime', hash: '#runtime', iconPaths: ['M12 3v5', 'M12 16v5', 'M4.9 4.9l3.5 3.5', 'M15.6 15.6l3.5 3.5', 'M3 12h5', 'M16 12h5', 'M4.9 19.1l3.5-3.5', 'M15.6 8.4l3.5-3.5'] },
  { label: 'Activity', hash: '#activity', iconPaths: ['M4 16l4-5 4 3 4-7 4 4', 'M4 20h16'] },
  { label: 'Shortcuts', hash: '#shortcuts', iconPaths: ['M8 7h8', 'M7 12h10', 'M9 17h6', 'M4 4h16v16H4z'] },
] as const;
const showDashboardTabs = computed(() => route.path === '/');
const activeDashboardHash = computed(() => route.hash || '#overview');
const entityStatusLabel = computed(() => (showIpcWarning.value ? 'Unavailable' : 'Connected'));
const entityStatusClass = computed(() =>
  showIpcWarning.value ? 'entity-status--warning' : 'entity-status--ok'
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
    const settings = await window.frappeCafe?.getSettings();
    sidebarCompact.value = settings?.sidebarCompact ?? false;
  } finally {
    settingsLoaded.value = true;
  }
};

const persistShellPreference = async (): Promise<void> => {
  if (!settingsLoaded.value) {
    return;
  }

  const existing = await window.frappeCafe?.getSettings();
  const settings = existing ?? buildDefaultSettings();
  await window.frappeCafe?.setSettings({
    ...settings,
    sidebarCompact: sidebarCompact.value,
  });
};

const toggleSidebarCompact = async (): Promise<void> => {
  sidebarCompact.value = !sidebarCompact.value;
  await persistShellPreference();
};

onMounted(() => {
  void loadShellPreference();
});
</script>

<style scoped>
.brand-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.sidebar-header {
  display: grid;
  gap: 12px;
}

.product-mark {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 4px;
}

.product-mark__dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(145deg, #3b82f6, #2563eb);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
  flex: 0 0 14px;
}

.workspace-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  border: 1px solid #e4e9ef;
  border-radius: 14px;
  background: #ffffff;
  padding: 10px 12px;
  cursor: default;
}

.workspace-switcher__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #eaf2ff;
  border: 1px solid #d3e2ff;
  color: #1e3a8a;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.workspace-switcher__copy {
  display: grid;
  gap: 2px;
}

.workspace-switcher__name {
  font-size: 13px;
  color: #1f272e;
}

.workspace-switcher__meta {
  font-size: 12px;
  color: #64748b;
}

.sidebar-toggle {
  min-width: 36px;
  min-height: 36px;
  border: 1px solid #d7dee8;
  border-radius: 10px;
  background: #ffffff;
  color: #334155;
  padding: 0 8px;
  font-size: 12px;
  cursor: pointer;
}

.sidebar-toggle:hover {
  background: #eef3f8;
  border-color: #cfd9e6;
}

.nav-block {
  margin-top: 8px;
}

.nav-section-title {
  margin: 0 0 8px;
  padding: 0 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
}

.nav-link {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 8px;
  align-items: center;
  padding: 10px 10px;
  border-radius: 12px;
}

.nav-link-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  border: 1px solid #e4e9ef;
  background: #f8fafc;
  color: #475569;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.nav-link.router-link-active {
  background: #f8fafc;
}

.nav-link.router-link-active .nav-link-icon {
  border-color: #bfd2ff;
  background: #dbe8ff;
  color: #1e3a8a;
}

.nav-link-title {
  grid-column: 2;
  font-size: 14px;
  font-weight: 500;
  color: #25313c;
}

.shell--compact {
  grid-template-columns: 92px minmax(0, 1fr);
}

.shell--compact .workspace-switcher,
.shell--compact .nav-section-title,
.shell--compact .sidebar-footer,
.shell--compact .brand-title,
.shell--compact .eyebrow {
  display: none;
}

.shell--compact .sidebar {
  padding-left: 10px;
  padding-right: 10px;
}

.shell--compact .product-mark {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

.shell--compact .sidebar-toggle {
  width: 100%;
  padding: 0;
  font-size: 11px;
}

.shell--compact .nav-link {
  grid-template-columns: 1fr;
  justify-items: center;
  padding: 8px;
}

.shell--compact .nav-link-title {
  display: none;
}

.sidebar-footer {
  margin-top: auto;
  padding: 14px 10px 4px;
  border-top: 1px solid #e4e9ef;
}

.sidebar-footer__label,
.sidebar-footer__value {
  margin: 0;
}

.sidebar-footer__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
}

.sidebar-footer__value {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.sidebar-footer__link {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #d7dee8;
  border-radius: 999px;
  background: #ffffff;
  font-size: 12px;
  color: #334155;
  text-decoration: none;
}

.sidebar-footer__link:hover {
  background: #eef3f8;
  border-color: #cfd9e6;
}

.sidebar-footer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.entity-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 4px 0 14px;
}

.entity-header__meta {
  min-width: 0;
}

.entity-header__context {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.01em;
}

.entity-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.entity-header__title {
  margin: 0;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.05;
  font-weight: 600;
  color: #1f272e;
}

.entity-header__body {
  margin: 8px 0 0;
  max-width: 780px;
  font-size: 14px;
  line-height: 1.55;
  color: #687381;
}

.entity-status {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
}

.entity-status--ok {
  color: #166534;
  background: #ecfdf3;
  border-color: #bbf7d0;
}

.entity-status--warning {
  color: #9b2c2c;
  background: #fff5f5;
  border-color: #fecaca;
}

.entity-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.entity-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #d7dee8;
  border-radius: 10px;
  background: #ffffff;
  color: #334155;
  text-decoration: none;
  white-space: nowrap;
}

.entity-action:hover {
  background: #eef3f8;
  border-color: #cfd9e6;
}

.entity-action--primary {
  background: #1f2937;
  border-color: #1f2937;
  color: #ffffff;
}

.entity-action--primary:hover {
  background: #111827;
  border-color: #111827;
}

.entity-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 18px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e4e9ef;
  overflow-x: auto;
}

.entity-tab {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  color: #64748b;
  text-decoration: none;
  white-space: nowrap;
}

.entity-tab:hover {
  background: #f8fafc;
  color: #334155;
}

.entity-tab--active {
  background: #f8fafc;
  color: #1f272e;
  box-shadow: inset 0 -2px 0 #1f272e;
}

.product-mark__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: linear-gradient(180deg, #4ab0ff 0%, #1d93ee 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 8px 18px rgba(30, 58, 138, 0.14);
}

.product-mark__badge-icon,
.sidebar-toggle__icon,
.workspace-switcher__chevron,
.nav-link-icon__svg,
.entity-tab__icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.product-mark__badge-icon {
  width: 20px;
  height: 20px;
  color: #ffffff;
}

.product-mark {
  gap: 12px;
}

.workspace-switcher {
  border-color: rgba(215, 222, 232, 0.8);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  padding: 11px 12px;
  box-shadow: 0 10px 28px rgba(148, 163, 184, 0.08);
}

.workspace-switcher__avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: linear-gradient(180deg, #eef5ff 0%, #dbeafe 100%);
  letter-spacing: 0.08em;
}

.workspace-switcher__copy {
  flex: 1;
}

.sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  min-height: 38px;
  border-color: rgba(215, 222, 232, 0.85);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  color: #475569;
  padding: 0;
}

.nav-link {
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  border: 1px solid transparent;
  text-decoration: none;
}

.nav-link-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border-color: rgba(215, 222, 232, 0.8);
  background: rgba(255, 255, 255, 0.72);
}

.nav-link-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.nav-link.router-link-active {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(215, 222, 232, 0.92);
  box-shadow: 0 10px 22px rgba(148, 163, 184, 0.08);
}

.nav-link.router-link-active .nav-link-icon {
  background: linear-gradient(180deg, #edf4ff 0%, #dbeafe 100%);
}

.nav-link-title {
  grid-column: auto;
  font-weight: 600;
}

.nav-link-description {
  font-size: 12px;
  line-height: 1.4;
  color: #64748b;
}

.workspace-frame {
  border: 1px solid rgba(228, 233, 239, 0.95);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 48px rgba(148, 163, 184, 0.12);
  overflow: hidden;
  backdrop-filter: blur(14px);
}

.entity-shell {
  padding: 18px 22px 0;
  border-bottom: 1px solid #edf2f7;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(249, 250, 251, 0.94) 100%);
}

.workspace-frame__body {
  padding: 22px;
}

.entity-header__title {
  font-size: clamp(30px, 4vw, 40px);
  line-height: 1.02;
}

.entity-action {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 12px;
}

.entity-action--primary {
  background: #111827;
  border-color: #111827;
}

.entity-action--primary:hover {
  background: #0f172a;
  border-color: #0f172a;
}

.entity-tabs {
  margin: 0;
  padding: 0 0 10px;
  border-bottom: 0;
}

.entity-tab {
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 12px 12px 0 0;
  border-bottom: 2px solid transparent;
}

.entity-tab:hover {
  background: transparent;
}

.entity-tab--active {
  background: transparent;
  box-shadow: none;
  border-bottom-color: #1f272e;
}

.shell--compact .nav-link-description {
  display: none;
}

.shell--compact .nav-link-copy,
.shell--compact .nav-link-title {
  display: none;
}

.shell--compact .nav-link {
  grid-template-columns: 1fr;
}

.sidebar-footer__cluster {
  display: grid;
  gap: 4px;
}

.ipc-warning {
  margin: 16px 22px 0;
  border-radius: 14px;
}

@media (max-width: 960px) {
  .shell--compact {
    grid-template-columns: 1fr;
  }

  .shell--compact .workspace-switcher,
  .shell--compact .nav-section-title,
  .shell--compact .sidebar-footer,
  .shell--compact .brand-title,
  .shell--compact .eyebrow {
    display: initial;
  }

  .shell--compact .nav-link {
    grid-template-columns: 26px 1fr;
    justify-items: stretch;
    padding: 10px 12px;
  }

  .shell--compact .nav-link-title {
    display: block;
  }

  .sidebar-footer {
    margin-top: 8px;
  }

  .entity-header,
  .entity-header__actions {
    flex-direction: column;
    align-items: stretch;
  }
}

.ipc-warning {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #fed7d7;
  background: #fff5f5;
}

.ipc-warning__eyebrow,
.ipc-warning__title,
.ipc-warning__body {
  margin: 0;
}

.ipc-warning__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b42318;
}

.ipc-warning__title {
  margin-top: 4px;
  font-size: 17px;
  color: #7a271a;
}

.ipc-warning__body {
  margin-top: 6px;
  color: #9b2c2c;
  line-height: 1.5;
}
</style>