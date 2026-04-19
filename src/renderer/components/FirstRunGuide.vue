<template>
  <section class="first-run-guide" :class="{ 'first-run-guide--compact': compact }">
    <div class="first-run-guide__intro">
      <p class="first-run-guide__eyebrow">Getting started</p>
      <h4 class="first-run-guide__title">{{ title }}</h4>
      <p class="first-run-guide__body">{{ body }}</p>
    </div>

    <ol class="first-run-guide__steps">
      <li v-for="step in steps" :key="step" class="first-run-guide__step">
        {{ step }}
      </li>
    </ol>

    <div v-if="links.length > 0" class="first-run-guide__links">
      <RouterLink
        v-for="link in links"
        :key="`${link.to}-${link.label}`"
        :to="link.to"
        class="first-run-guide__link"
      >
        {{ link.label }}
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

export type FirstRunGuideLink = {
  label: string;
  to: string;
};

defineProps<{
  title: string;
  body: string;
  steps: string[];
  links: FirstRunGuideLink[];
  compact?: boolean;
}>();
</script>

<style scoped>
.first-run-guide {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e4e9ef;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.first-run-guide--compact {
  padding: 14px;
}

.first-run-guide__intro,
.first-run-guide__steps {
  margin: 0;
}

.first-run-guide__eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.first-run-guide__title {
  margin: 0;
  font-size: 18px;
  color: #1f272e;
}

.first-run-guide__body {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.5;
}

.first-run-guide__steps {
  padding-left: 18px;
  display: grid;
  gap: 8px;
  color: #334155;
}

.first-run-guide__step {
  line-height: 1.5;
}

.first-run-guide__links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.first-run-guide__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #d7dee8;
  background: #f8fafc;
  color: #334155;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
}

.first-run-guide__link:hover {
  background: #eef3f8;
  border-color: #cfd9e6;
}
</style>