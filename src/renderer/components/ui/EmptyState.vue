<template>
  <section
    class="flex min-h-[60vh] flex-col items-center justify-center p-12 bg-white text-center rounded-lg"
  >
    <div
      v-if="icon"
      class="mb-4 flex size-12 items-center justify-center rounded-xl bg-surface-gray-2 text-ink-gray-6"
    >
      <component
        :is="icon"
        class="size-6"
        aria-hidden="true"
      />
    </div>
    <h2 class="m-0 text-lg font-semibold text-ink-gray-9">
      {{ title }}
    </h2>
    <p class="mt-2 mb-6 text-sm text-ink-gray-5">
      {{ description }}
    </p>
    <div>
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  title: string;
  description: string;
  icon?: Component;
}>();
</script>
