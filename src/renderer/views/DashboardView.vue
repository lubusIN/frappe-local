<template>
  <div class="dashboard">
    <FirstRunGuide
      v-if="showGettingStarted"
      title="Set up your local environment"
      body="A fresh install has no benches or sites yet. Start with one bench, then create a site once the runtime is healthy."
      :links="gettingStartedLinks"
    />

    <section
      id="shortcuts"
      class="dashboard-section"
    >
      <div class="shortcut-grid">
        <RouterLink
          to="/benches"
          class="shortcut-link"
        >
          <Card class="shortcut-card">
            <div class="shortcut-card__content">
              <div class="shortcut-card__icon">
                <IconPackage class="shortcut-card__svg" />
              </div>
              <div>
                <p class="shortcut-card__title">
                  Manage Benches
                </p>
                <p class="shortcut-card__desc">
                  Create and control bench environments
                </p>
              </div>
            </div>
          </Card>
        </RouterLink>
        <RouterLink
          to="/sites"
          class="shortcut-link"
        >
          <Card class="shortcut-card">
            <div class="shortcut-card__content">
              <div class="shortcut-card__icon">
                <IconGlobe class="shortcut-card__svg" />
              </div>
              <div>
                <p class="shortcut-card__title">
                  Manage Sites
                </p>
                <p class="shortcut-card__desc">
                  View and control local sites
                </p>
              </div>
            </div>
          </Card>
        </RouterLink>
        <Card
          class="shortcut-card shortcut-card--interactive"
          role="button"
          tabindex="0"
          @click="openSettings"
          @keydown.enter="openSettings"
          @keydown.space.prevent="openSettings"
        >
          <div class="shortcut-card__content">
            <div class="shortcut-card__icon">
              <IconSettings class="shortcut-card__svg" />
            </div>
            <div>
              <p class="shortcut-card__title">
                Configure Settings
              </p>
              <p class="shortcut-card__desc">
                Configure global settings and defaults
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { Card } from 'frappe-ui';
import { RouterLink } from 'vue-router';
import IconGlobe from '~icons/lucide/globe';
import IconPackage from '~icons/lucide/package';
import IconSettings from '~icons/lucide/settings';
import FirstRunGuide, { type FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import { useIpc } from '../composables/useIpc';
import { useSettingsDialog } from '../composables/useSettingsDialog';

const ipc = useIpc();
const { open: openSettings } = useSettingsDialog();
const setupSummary = reactive({ benches: 0, sites: 0 });

const refreshSetupSummary = async (): Promise<void> => {
  try {
    const [benches, sites] = await Promise.all([
      ipc.listBenches(),
      ipc.listSites(),
    ]);

    setupSummary.benches = benches.length;
    setupSummary.sites = sites.length;

  } catch {
    setupSummary.benches = 0;
    setupSummary.sites = 0;

  }
};

onMounted(() => {
  void refreshSetupSummary();
});

const showGettingStarted = computed(() =>
  setupSummary.benches === 0
);

const gettingStartedLinks = computed<FirstRunGuideLink[]>(() => {
  const links: FirstRunGuideLink[] = [];

  if (setupSummary.benches === 0) {
    links.push({ label: 'Create a bench', to: '/benches' });
  }

  if (setupSummary.benches > 0 && setupSummary.sites === 0) {
    links.push({ label: 'Create a site', to: '/sites' });
  }



  links.push({ label: 'Check settings', onClick: openSettings });

  return links;
});


</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 24px;
}

.dashboard-section {
  display: grid;
  gap: 16px;
}

.section-heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-desc {
  margin: -8px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}



/* ============================================================
   Shortcut Grid
   ============================================================ */

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.shortcut-link {
  text-decoration: none;
  color: inherit;
}

.shortcut-card {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  box-shadow: none;
  padding: 16px !important;
  transition: background-color 100ms ease, border-color 100ms ease;
}

.shortcut-card__content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.shortcut-card:hover,
.shortcut-card--interactive:hover {
  background: var(--surface-hover);
  border-color: var(--border-default);
}

.shortcut-card--interactive {
  cursor: pointer;
}

.shortcut-card--interactive:focus-visible {
  outline: 2px solid var(--outline-gray-3);
  outline-offset: 2px;
}

.shortcut-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.shortcut-card__svg {
  width: 20px;
  height: 20px;
}

.shortcut-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
}

.shortcut-card__desc {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.shortcut-card :deep(.flex.items-baseline.justify-between) {
  display: none;
}

.shortcut-card :deep(.mt-4.flex-auto.overflow-auto) {
  margin-top: 0;
  overflow: visible;
}

/* ============================================================
   Responsive
   ============================================================ */

@media (max-width: 1080px) {
  .shortcut-grid {
    grid-template-columns: 1fr;
  }
}
</style>
