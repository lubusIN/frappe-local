<template>
  <section class="panel-grid">
    <article class="panel-card wide">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h3 class="panel-title">{{ title }}</h3>
      <p class="panel-copy">{{ description }}</p>
    </article>

    <article class="panel-card">
      <h3 class="panel-title">Planned next slice</h3>
      <p class="panel-copy">{{ nextSlice }}</p>
    </article>

    <article class="panel-card">
      <h3 class="panel-title">Why this page exists now</h3>
      <ul class="bullet-list">
        <li v-for="item in bullets" :key="item">{{ item }}</li>
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