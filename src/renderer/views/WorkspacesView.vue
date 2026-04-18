<template>
  <PlaceholderPanel
    eyebrow="Organization"
    title="Workspaces are represented from the beginning, not bolted on later."
    description="This route exists so grouping, tagging, and project views can be added without reworking primary navigation."
    next-slice="Phase 7 will fill this area with project/client grouping and grouped site navigation."
    :bullets="[
      'Preserves room for future grouping features.',
      'Prevents later navigation churn when workspaces become real.',
      'Keeps the UX model close to the PRD early in development.'
    ]"
  />
</template>

<script setup lang="ts">
import PlaceholderPanel from '../components/PlaceholderPanel.vue';
</script>