<template>
  <PlaceholderPanel
    eyebrow="Site Management"
    title="Site management is reserved as its own workflow surface."
    description="The sites route is where bench-scoped site creation, status visibility, and install flows will land."
    next-slice="This page will later host site tables, filters, and lifecycle actions backed by persisted data."
    :bullets="[
      'Separates site workflows from bench workflows early.',
      'Makes future filtering and grouping easier to layer in.',
      'Keeps the renderer shell aligned with the target information architecture.'
    ]"
  />
</template>

<script setup lang="ts">
import PlaceholderPanel from '../components/PlaceholderPanel.vue';
</script>