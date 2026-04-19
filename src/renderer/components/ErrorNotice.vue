<template>
  <section
    class="error-notice"
    :class="`error-notice--${tone}`"
    role="alert"
    aria-live="polite"
    aria-atomic="true"
  >
    <p class="error-notice__eyebrow">Needs attention</p>
    <h4 class="error-notice__title" :id="titleId">{{ notice.title }}</h4>
    <p :id="reasonId" class="error-notice__reason">{{ notice.reason }}</p>

    <ul class="error-notice__steps" :aria-describedby="reasonId">
      <li v-for="step in notice.steps" :key="step">{{ step }}</li>
    </ul>

    <div v-if="notice.actions.length > 0" class="error-notice__actions">
      <template v-for="action in notice.actions" :key="action.id">
        <RouterLink
          v-if="action.to"
          class="error-notice__action error-notice__action--link"
          :to="action.to"
          :aria-label="`${action.label}: navigate to resolve this error`"
        >
          {{ action.label }}
        </RouterLink>
        <button
          v-else
          type="button"
          class="error-notice__action"
          :aria-label="`${action.label}: take action to resolve this error`"
          @click="$emit('action', action.id)"
        >
          {{ action.label }}
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { ErrorRemediationNotice } from '../error-remediation';

defineProps<{
  notice: ErrorRemediationNotice;
  tone?: 'danger' | 'warning';
}>();

defineEmits<{
  (event: 'action', actionId: string): void;
}>();

// Generate unique IDs for accessibility linking
const titleId = computed(() => `error-notice-title-${Math.random().toString(36).substr(2, 9)}`);
const reasonId = computed(() => `error-notice-reason-${Math.random().toString(36).substr(2, 9)}`);
</script>

<style scoped>
.error-notice {
  display: grid;
  gap: 10px;
  border-radius: 14px;
  padding: 14px;
  border: 1px solid rgba(145, 34, 34, 0.24);
  background: linear-gradient(170deg, rgba(255, 238, 232, 0.95), rgba(255, 249, 247, 0.98));
}

.error-notice--warning {
  border-color: rgba(171, 110, 31, 0.24);
  background: linear-gradient(170deg, rgba(255, 246, 224, 0.95), rgba(255, 251, 241, 0.98));
}

.error-notice__eyebrow {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7b2f23;
}

.error-notice--warning .error-notice__eyebrow {
  color: #8b5f12;
}

.error-notice__title,
.error-notice__reason,
.error-notice__steps {
  margin: 0;
}

.error-notice__title {
  font-size: 1rem;
}

.error-notice__reason {
  color: #6f3428;
}

.error-notice__steps {
  padding-left: 18px;
  color: #6b4b3a;
}

.error-notice__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.error-notice__action {
  border: 1px solid rgba(145, 34, 34, 0.18);
  background: rgba(255, 255, 255, 0.7);
  color: #70281e;
  border-radius: 999px;
  padding: 8px 12px;
  text-decoration: none;
  font: inherit;
  cursor: pointer;
}

.error-notice--warning .error-notice__action {
  border-color: rgba(171, 110, 31, 0.18);
  color: #7a5310;
}

.error-notice__action--link {
  display: inline-flex;
  align-items: center;
}
</style>
