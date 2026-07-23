<template>
  <FormControl
    type="select"
    v-model="internalModel"
    :options="frappeVersionOptions"
  />
</template>

<script setup lang="ts">
import { FormControl } from 'frappe-ui';
import { computed } from 'vue';
import { toSelectorFrappeVersion } from '@frappe-local/renderer/utils';

const model = defineModel<string>();

const internalModel = computed({
  get: () => toSelectorFrappeVersion(model.value),
  set: (val) => {
    model.value = val;
  }
});

const frappeVersionOptions = [
  { label: 'Version 16', value: 'version-16' },
  { label: 'Version 15', value: 'version-15' },
  { label: 'Develop', value: 'develop' },
];
</script>
