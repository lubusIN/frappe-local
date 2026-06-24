<template>
  <FrappeUIProvider>
    <AppShell />
  </FrappeUIProvider>
</template>

<script setup lang="ts">
import { FrappeUIProvider } from 'frappe-ui';
import AppShell from '@frappe-local/renderer/components/AppShell.vue';
import { useTheme } from '@frappe-local/renderer/composables/system';

useTheme();
</script>