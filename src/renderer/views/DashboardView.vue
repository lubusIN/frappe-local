<template>
  <PlaceholderPanel
    eyebrow="Overview"
    title="The dashboard now anchors the primary experience."
    :description="description"
    next-slice="Checkpoint 4 will add lint/type/test quality tooling and harden the base development workflow."
    :bullets="[
      'Creates a stable landing page for first launch.',
      'Lets later phases add health cards and quick actions without redesigning navigation.',
      'Confirms the renderer shell can host wide and narrow content blocks.',
      healthSummary
    ]"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PlaceholderPanel from '../components/PlaceholderPanel.vue';

const description = ref(
  'This page reserves space for setup health, recent activity, and fast entry points into bench and site creation.'
);

const healthSummary = ref('IPC smoke check is pending.');

onMounted(async () => {
  if (!window.frappeCafe) {
    healthSummary.value = 'IPC smoke check unavailable: preload bridge is missing.';
    return;
  }

  try {
    const response = await window.frappeCafe.checkAppHealth();
    healthSummary.value = `IPC smoke check passed: ${response.appName} on ${response.platform} (Electron ${response.electronVersion}).`;
  } catch {
    healthSummary.value = 'IPC smoke check failed: unable to reach main process handler.';
  }
});
</script>