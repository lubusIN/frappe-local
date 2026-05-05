<template>
  <div class="dashboard">
    <FirstRunGuide
      v-if="showGettingStarted"
      title="Set up your local environment"
      body="A fresh install has no benches or sites yet. Start with one bench, then create a site once the runtime is healthy."
      :links="gettingStartedLinks"
    />



    <section id="shortcuts" class="dashboard-section">
      <h2 class="section-heading">Quick Actions</h2>
      <p class="section-desc">Jump directly into the core operational areas from the overview surface.</p>
      <div class="shortcut-grid">
        <RouterLink to="/benches" class="shortcut-card">
          <div class="shortcut-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 7v10h14V7" /><path d="M4 7h16" />
            </svg>
          </div>
          <div>
            <p class="shortcut-card__title">Manage Benches</p>
            <p class="shortcut-card__desc">Create and control bench environments</p>
          </div>
        </RouterLink>
        <RouterLink to="/sites" class="shortcut-card">
          <div class="shortcut-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="11" r="7" /><path d="M5 11h14" />
            </svg>
          </div>
          <div>
            <p class="shortcut-card__title">Manage Sites</p>
            <p class="shortcut-card__desc">View and control local sites</p>
          </div>
        </RouterLink>
        <button type="button" class="shortcut-card" @click="openSettings">
          <div class="shortcut-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <div class="text-left">
            <p class="shortcut-card__title">Configure Settings</p>
            <p class="shortcut-card__desc">Configure global settings and defaults</p>
          </div>
        </button>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { RouterLink } from 'vue-router';
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
  setupSummary.benches === 0 || setupSummary.sites === 0
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

.shortcut-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  text-decoration: none;
  color: inherit;
  width: 100%;
  text-align: left;
  transition: background-color 100ms ease, border-color 100ms ease;
}

.shortcut-card:hover {
  background: var(--surface-hover);
  border-color: var(--border-default);
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

.shortcut-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.shortcut-card__desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
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