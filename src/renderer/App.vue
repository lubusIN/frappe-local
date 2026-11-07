<template>
  <div class="h-full w-full relative">
    <FrappeUIProvider>
      <AppShell />
      <AppLifecycleOverlay />
    </FrappeUIProvider>
  </div>
</template>

<script setup lang="ts">
import { FrappeUIProvider } from 'frappe-ui';
import AppShell from '@frappe-local/renderer/components/AppShell.vue';
import AppLifecycleOverlay from '@frappe-local/renderer/components/AppLifecycleOverlay.vue';
import { useTheme } from '@frappe-local/renderer/composables/system';

useTheme();
</script>