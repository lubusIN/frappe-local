<template>
  <PlaceholderPanel
    eyebrow="Overview"
    title="The dashboard now anchors the primary experience."
    description="This page reserves space for setup health, recent activity, and fast entry points into bench and site creation."
    next-slice="Checkpoint 3 will wire preload and IPC boundaries so this surface can start showing real app health."
    :bullets="[
      'Creates a stable landing page for first launch.',
      'Lets later phases add health cards and quick actions without redesigning navigation.',
      'Confirms the renderer shell can host wide and narrow content blocks.'
    ]"
  />
</template>

<script setup lang="ts">
import PlaceholderPanel from '../components/PlaceholderPanel.vue';
</script>