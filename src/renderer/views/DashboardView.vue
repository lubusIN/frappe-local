<template>
  <div class="grid gap-6">
    <FirstRunGuide
      v-if="showGettingStarted"
      title="Set up your local environment"
      body="A fresh install has no benches or sites yet. Start with one bench, then create a site once the runtime is healthy."
      :links="gettingStartedLinks"
    />

    <section
      id="shortcuts"
      class="grid gap-4"
    >
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ShortcutCard
          to="/benches"
          title="Manage Benches"
          description="Create and control bench environments"
          :icon="IconPackage"
        />
        <ShortcutCard
          to="/sites"
          title="Manage Sites"
          description="View and control local sites"
          :icon="IconGlobe"
        />
        <ShortcutCard
          title="Configure Settings"
          description="Configure global settings and defaults"
          :icon="IconSettings"
          @click="openSettings"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import IconPackage from '~icons/lucide/package';
import IconGlobe from '~icons/lucide/globe';
import IconSettings from '~icons/lucide/settings';
import { computed, onMounted, reactive } from 'vue';
import FirstRunGuide, { type FirstRunGuideLink } from '@frappe-local/renderer/components/FirstRunGuide.vue';
import ShortcutCard from '@frappe-local/renderer/components/ui/ShortcutCard.vue';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';
import { useSettingsDialog } from '@frappe-local/renderer/composables/ui/useSettingsDialog';

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
