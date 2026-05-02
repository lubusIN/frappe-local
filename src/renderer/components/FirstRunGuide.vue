<template>
  <section class="first-run" :class="{ 'first-run--compact': compact }">
    <div class="first-run__header">
      <div class="first-run__icon">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 3l7 4v6l-7 4-7-4V7l7-4z" />
          <path d="M10 10v7" />
          <path d="M3 7l7 3 7-3" />
        </svg>
      </div>
      <div>
        <h4 class="first-run__title">{{ title }}</h4>
        <p class="first-run__body">{{ body }}</p>
      </div>
    </div>

    <ol v-if="steps && steps.length > 0" class="first-run__steps">
      <li v-for="step in steps" :key="step" class="first-run__step">
        {{ step }}
      </li>
    </ol>

    <div v-if="links.length > 0" class="first-run__links">
      <component
        v-for="link in links"
        :key="`${link.to || 'action'}-${link.label}`"
        :is="link.to ? 'RouterLink' : 'button'"
        v-bind="link.to ? { to: link.to } : { type: 'button' }"
        class="first-run__link"
        @click="link.onClick"
      >
        {{ link.label }}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </component>
    </div>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

export type FirstRunGuideLink = {
  label: string;
  to?: string;
  onClick?: () => void;
};

defineProps<{
  title: string;
  body: string;
  steps?: string[];
  links: FirstRunGuideLink[];
  compact?: boolean;
}>();
</script>

<style scoped>
.first-run {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--blue-border);
  background: var(--blue-light);
}

.first-run--compact {
  padding: 14px;
}

.first-run__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.first-run__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--blue-text);
  border: 1px solid var(--blue-border);
}

.first-run__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.first-run__body {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.first-run__steps {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.first-run__step {
  line-height: 1.5;
}

.first-run__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.first-run__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  text-decoration: none;
  font-size: 12px;
  font-weight: 500;
  transition: background-color 100ms ease;
}

.first-run__link:hover {
  background: var(--surface-hover);
}
</style>