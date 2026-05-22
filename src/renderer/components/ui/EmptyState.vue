<template>
  <section
    class="flex min-h-[300px] flex-col items-center justify-center p-12 bg-white text-center rounded-lg"
  >
    <h2 class="m-0 text-lg font-semibold text-ink-gray-9">
      {{ title }}
    </h2>
    <p class="mt-2 mb-6 text-sm text-ink-gray-5">
      {{ description }}
    </p>
    <div class="mt-6">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>
