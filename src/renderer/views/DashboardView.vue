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
        <RouterLink
          to="/benches"
          class="no-underline text-inherit"
        >
          <div class="w-full rounded-lg border border-outline-gray-2 bg-surface-white p-4 transition-colors hover:bg-surface-gray-1 hover:border-outline-gray-3">
            <div class="flex items-start gap-3">
              <div class="flex items-center justify-center size-9 min-w-9 rounded-lg bg-surface-gray-2 text-ink-gray-5">
                <IconPackage class="size-5" />
              </div>
              <div>
                <p class="m-0 text-[13px] font-semibold text-ink-gray-9 leading-snug">
                  Manage Benches
                </p>
                <p class="m-0 mt-0.5 text-xs text-ink-gray-5 leading-normal">
                  Create and control bench environments
                </p>
              </div>
            </div>
          </div>
        </RouterLink>
        <RouterLink
          to="/sites"
          class="no-underline text-inherit"
        >
          <div class="w-full rounded-lg border border-outline-gray-2 bg-surface-white p-4 transition-colors hover:bg-surface-gray-1 hover:border-outline-gray-3">
            <div class="flex items-start gap-3">
              <div class="flex items-center justify-center size-9 min-w-9 rounded-lg bg-surface-gray-2 text-ink-gray-5">
                <IconGlobe class="size-5" />
              </div>
              <div>
                <p class="m-0 text-[13px] font-semibold text-ink-gray-9 leading-snug">
                  Manage Sites
                </p>
                <p class="m-0 mt-0.5 text-xs text-ink-gray-5 leading-normal">
                  View and control local sites
                </p>
              </div>
            </div>
          </div>
        </RouterLink>
        <div
          class="w-full rounded-lg border border-outline-gray-2 bg-surface-white p-4 transition-colors hover:bg-surface-gray-1 hover:border-outline-gray-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-outline-gray-3 focus-visible:outline-offset-2"
          role="button"
          tabindex="0"
          @click="openSettings"
          @keydown.enter="openSettings"
          @keydown.space.prevent="openSettings"
        >
          <div class="flex items-start gap-3">
            <div class="flex items-center justify-center size-9 min-w-9 rounded-lg bg-surface-gray-2 text-ink-gray-5">
              <IconSettings class="size-5" />
            </div>
            <div>
              <p class="m-0 text-[13px] font-semibold text-ink-gray-9 leading-snug">
                Configure Settings
              </p>
              <p class="m-0 mt-0.5 text-xs text-ink-gray-5 leading-normal">
                Configure global settings and defaults
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
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
