<template>
  <section class="panel-grid">
    <article class="panel-card wide">
      <p class="card-eyebrow">{{ eyebrow }}</p>
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

<style scoped>
.panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.panel-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface-card);
}

.panel-card.wide {
  grid-column: 1 / -1;
  background: var(--primary-light);
  border-color: var(--primary-border);
}

.card-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.panel-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-copy {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.wide .panel-copy {
  color: #1a365d;
}

.bullet-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.bullet-list li {
  margin-bottom: 4px;
}
</style>