<template>
  <div
    class="grid grid-cols-2 gap-3 sm:grid-cols-3"
    role="radiogroup"
    aria-label="Frappe version"
  >
    <div
      v-for="option in frappeVersionOptions"
      :key="option.value"
    >
      <Button
        type="button"
        variant="subtle"
        :aria-label="option.label"
        role="radio"
        :aria-checked="selectedValue === option.value"
        :class="[
          'flex w-full cursor-pointer items-center justify-between rounded border border-outline-gray-3 !p-3 text-sm font-normal leading-5 text-ink-gray-9 focus:outline-none !min-h-0 !h-auto',
          selectedValue === option.value
            ? 'border-outline-gray-5 bg-surface-gray-2 ring-1 ring-gray-900 hover:bg-surface-gray-2'
            : 'bg-surface-white hover:bg-surface-gray-1',
        ]"
        @click="model = option.value"
      >
        <span class="font-medium">{{ option.label }}</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button } from 'frappe-ui';
import { toSelectorFrappeVersion } from '../frappe-version';

const model = defineModel<string>();
const selectedValue = computed(() => toSelectorFrappeVersion(model.value));

const frappeVersionOptions = [
  { label: 'Version 16', value: 'version-16' },
  { label: 'Version 15', value: 'version-15' },
  { label: 'Develop', value: 'develop' },
];
</script>
