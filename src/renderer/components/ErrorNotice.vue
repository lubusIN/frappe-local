<template>
  <section
    class="error-notice"
    :class="`error-notice--${tone}`"
    role="alert"
    aria-live="polite"
    aria-atomic="true"
  >
    <div class="error-notice__icon">
      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
    </div>
    <div class="error-notice__content">
      <h4 class="error-notice__title" :id="titleId">{{ notice.title }}</h4>
      <p :id="reasonId" class="error-notice__reason">{{ notice.reason }}</p>

      <ul v-if="notice.steps.length > 0" class="error-notice__steps" :aria-describedby="reasonId">
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
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-radius: 8px;
  padding: 14px 16px;
  border: 1px solid var(--red-border);
  background: var(--red-light);
  color: var(--red-text);
}

.error-notice--warning {
  border-color: var(--orange-border);
  background: var(--orange-light);
  color: var(--orange-text);
}

.error-notice__icon {
  margin-top: 1px;
}

.error-notice__content {
  display: grid;
  gap: 6px;
}

.error-notice__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.error-notice__reason {
  margin: 0;
  font-size: 13px;
  color: #9b2c2c;
  line-height: 1.5;
}

.error-notice--warning .error-notice__reason {
  color: #92400e;
}

.error-notice__steps {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: #9b2c2c;
  line-height: 1.5;
}

.error-notice--warning .error-notice__steps {
  color: #92400e;
}

.error-notice__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.error-notice__action {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--red-border);
  background: var(--surface-card);
  color: var(--red-text);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.error-notice__action:hover {
  background: var(--red-light);
}

.error-notice--warning .error-notice__action {
  border-color: var(--orange-border);
  color: var(--orange-text);
}

.error-notice--warning .error-notice__action:hover {
  background: var(--orange-light);
}
</style>
