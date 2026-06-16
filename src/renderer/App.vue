<template>
  <FrappeUIProvider>
    <AppShell />
  </FrappeUIProvider>
</template>

<script setup lang="ts">
import { FrappeUIProvider } from 'frappe-ui';
import AppShell from './components/AppShell.vue';
</script>

<style>
/* Allow toast to expand horizontally instead of truncating or wrapping to a second line */
.toast-root-animatable {
  max-width: max-content !important;
}

.toast-root-animatable .break-words {
  white-space: nowrap !important;
}
</style>