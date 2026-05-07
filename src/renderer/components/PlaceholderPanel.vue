<template>
  <section class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
    <article class="col-span-full rounded-lg border border-outline-blue-1 bg-surface-blue-2 p-4">
      <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-blue-3">
        {{ eyebrow }}
      </p>
      <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
        {{ title }}
      </h3>
      <p class="m-0 text-[13px] leading-relaxed text-ink-blue-3">
        {{ description }}
      </p>
    </article>

    <article class="rounded-lg border border-outline-gray-2 bg-surface-white p-4">
      <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
        Planned next slice
      </h3>
      <p class="m-0 text-[13px] leading-relaxed text-ink-gray-6">
        {{ nextSlice }}
      </p>
    </article>

    <article class="rounded-lg border border-outline-gray-2 bg-surface-white p-4">
      <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
        Why this page exists now
      </h3>
      <ul class="m-0 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-gray-6">
        <li
          v-for="item in bullets"
          :key="item"
        >
          {{ item }}
        </li>
      </ul>
    </article>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
  nextSlice: string;
  bullets: string[];
}>();
</script>