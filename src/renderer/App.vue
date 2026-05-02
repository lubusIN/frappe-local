<template>
  <FrappeUIProvider>
    <AppShell />
  </FrappeUIProvider>
</template>

<script setup lang="ts">
import { FrappeUIProvider } from 'frappe-ui';
import AppShell from './components/AppShell.vue';
</script>