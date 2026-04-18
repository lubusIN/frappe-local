<template>
  <PlaceholderPanel
    eyebrow="Bench Management"
    title="Bench lifecycle screens now have a dedicated home."
    description="The benches route will expand into list, detail, and create flows once orchestration and persistence are in place."
    next-slice="Future phases will replace this placeholder with bench creation, runtime state, logs, and actions."
    :bullets="[
      'Ensures the URL structure exists before stateful UI arrives.',
      'Provides a stable mount point for the bench wizard and detail panels.',
      'Keeps the navigation model aligned with the PRD from the start.'
    ]"
  />
</template>

<script setup lang="ts">
import PlaceholderPanel from '../components/PlaceholderPanel.vue';
</script>