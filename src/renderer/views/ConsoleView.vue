<template>
  <PlaceholderPanel
    eyebrow="Developer Tooling"
    title="The console route is in place for terminal and editor integration."
    description="Embedded terminal sessions and editor launch actions will later plug into this route without changing the shell."
    next-slice="Phase 8 will add xterm-based sessions, context switching, and tool launch actions here."
    :bullets="[
      'Sets the expectation that console support is a first-class feature.',
      'Makes tooling integration a navigation concern, not an afterthought.',
      'Prepares the app shell for context-aware bench and site command execution.'
    ]"
  />
</template>

<script setup lang="ts">
import PlaceholderPanel from '../components/PlaceholderPanel.vue';
</script>