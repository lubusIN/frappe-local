<template>
  <PlaceholderPanel
    eyebrow="Preferences"
    title="Settings is ready for runtime defaults, storage paths, and tooling preferences."
    description="The placeholder keeps configuration concerns isolated so future persistence and diagnostics have a natural home."
    next-slice="Later checkpoints will connect this route to actual runtime preferences and health diagnostics."
    :bullets="[
      'Protects the future settings IA from ad hoc placement.',
      'Gives diagnostics and preferences a stable route early.',
      'Supports the PRD requirement for editor, runtime, and update preferences.'
    ]"
  />
</template>

<script setup lang="ts">
import PlaceholderPanel from '../components/PlaceholderPanel.vue';
</script>