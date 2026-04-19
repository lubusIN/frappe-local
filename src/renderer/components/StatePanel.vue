<template>
  <section
    class="state-panel"
    :class="`state-panel--${kind}`"
    role="status"
    aria-live="polite"
    :aria-busy="kind === 'loading'"
    :aria-label="accessibilityLabel"
  >
    <p class="state-panel__eyebrow">{{ eyebrowLabel }}</p>
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

const eyebrowLabel = computed(() => {
  if (props.kind === 'loading') return 'Loading state';
  if (props.kind === 'error') return 'Action needed';
  return 'Empty state';
});

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
  border-radius: 10px;
  border: 1px solid #e4e9ef;
  background: #f8fafc;
  padding: 14px;
  display: grid;
  gap: 8px;
}

.state-panel--loading {
  background: #f8fafc;
}

.state-panel--empty {
  background: #ffffff;
}

.state-panel--error {
  border-color: #fecaca;
  background: #fff7f7;
}

.state-panel__eyebrow,
.state-panel__title,
.state-panel__body {
  margin: 0;
}

.state-panel__eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.state-panel--error .state-panel__eyebrow {
  color: #b42318;
}

.state-panel__title {
  font-size: 16px;
  color: #1f272e;
}

.state-panel__body {
  color: #64748b;
}

.state-panel--error .state-panel__body {
  color: #9b2c2c;
}

.state-panel__action {
  width: fit-content;
  border-radius: 8px;
  border: 1px solid #d7dee8;
  background: #ffffff;
  color: #334155;
  padding: 6px 12px;
  cursor: pointer;
}

.state-panel--error .state-panel__action {
  border-color: #fca5a5;
  color: #912018;
}
</style>
