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
  gap: 16px;
  padding: 20px 22px;
  border-radius: 20px;
  border: 1px solid rgba(111, 74, 41, 0.18);
  background:
    radial-gradient(circle at top right, rgba(216, 165, 109, 0.22), transparent 38%),
    linear-gradient(145deg, rgba(255, 248, 238, 0.96), rgba(248, 237, 220, 0.9));
  box-shadow: 0 18px 42px rgba(76, 51, 22, 0.08);
}

.first-run-guide--compact {
  padding: 16px 18px;
}

.first-run-guide__intro,
.first-run-guide__steps {
  margin: 0;
}

.first-run-guide__eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9a6f47;
}

.first-run-guide__title {
  margin: 0;
  font-size: 22px;
  color: #2f2116;
}

.first-run-guide__body {
  margin: 10px 0 0;
  color: #5f4a37;
  line-height: 1.6;
}

.first-run-guide__steps {
  padding-left: 20px;
  display: grid;
  gap: 10px;
  color: #4b3828;
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
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(111, 74, 41, 0.18);
  background: rgba(255, 251, 245, 0.9);
  color: #54351d;
  text-decoration: none;
  font-weight: 600;
}

.first-run-guide__link:hover {
  background: rgba(255, 246, 233, 0.96);
}
</style>