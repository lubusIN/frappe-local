<template>
  <Select
    v-model="model"
    :options="frappeVersionOptions"
    :placeholder="placeholder"
  />
</template>

<script setup lang="ts">
import { Select } from 'frappe-ui';

withDefaults(defineProps<{
  placeholder?: string;
}>(), {
  placeholder: 'Select Frappe version',
});

const model = defineModel<string>();

const frappeVersionOptions = [
  { label: 'Version 15', value: 'version-15' },
  { label: 'Version 16', value: 'version-16' },
  { label: 'Develop', value: 'develop' },
];
</script>
