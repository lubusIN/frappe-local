<template>
  <section
    class="state-panel"
    :class="`state-panel--${kind}`"
    role="status"
    aria-live="polite"
    :aria-busy="kind === 'loading'"
    :aria-label="accessibilityLabel"
  >
    <div class="state-panel__icon">
      <!-- Loading -->
      <svg v-if="kind === 'loading'" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="10" cy="10" r="7" opacity="0.25" />
        <path d="M10 3a7 7 0 015.5 11.2" stroke-linecap="round" />
      </svg>
      <!-- Empty -->
      <svg v-else-if="kind === 'empty'" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="14" height="10" rx="1" />
        <path d="M7 9h6M7 12h4" />
      </svg>
      <!-- Error -->
      <svg v-else viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
    </div>
    <div class="state-panel__content">
      <h4 class="state-panel__title">{{ title }}</h4>
      <p v-if="body" class="state-panel__body">{{ body }}</p>
      <button
        v-if="actionLabel"
        type="button"
        class="state-panel__action"
        :aria-label="actionAriaLabel"
        @click="$emit('action')"
      >
        {{ actionLabel }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  kind: 'loading' | 'empty' | 'error';
  title: string;
  body?: string;
  actionLabel?: string;
}>();

defineEmits<{
  (event: 'action'): void;
}>();

const accessibilityLabel = computed(() => {
  if (props.kind === 'loading') return `Loading: ${props.title}`;
  if (props.kind === 'error') return `Error: ${props.title}`;
  return `Empty: ${props.title}`;
});

const actionAriaLabel = computed(() => {
  if (props.kind === 'error') return `${props.actionLabel}: retry this action`;
  if (props.kind === 'loading') return `${props.actionLabel}: cancel loading`;
  return `${props.actionLabel}`;
});
</script>

<style scoped>
.state-panel {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--surface-card);
  padding: 14px 16px;
}

.state-panel--loading {
  background: var(--surface-subtle);
}

.state-panel--empty {
  background: var(--surface-card);
}

.state-panel--error {
  border-color: var(--red-border);
  background: var(--red-light);
}

.state-panel__icon {
  min-width: 16px;
  margin-top: 1px;
  color: var(--text-muted);
}

.state-panel--error .state-panel__icon {
  color: var(--red-text);
}

.state-panel--loading .state-panel__icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.state-panel__content {
  min-width: 0;
}

.state-panel__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.state-panel--error .state-panel__title {
  color: var(--red-text);
}

.state-panel__body {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.state-panel--error .state-panel__body {
  color: #9b2c2c;
}

.state-panel__action {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.state-panel__action:hover {
  background: var(--surface-hover);
}

.state-panel--error .state-panel__action {
  border-color: var(--red-border);
  color: var(--red-text);
  background: var(--surface-card);
}
</style>
