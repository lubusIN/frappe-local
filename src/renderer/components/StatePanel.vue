<template>
  <section class="state-panel" :class="`state-panel--${kind}`" role="status" aria-live="polite">
    <p class="state-panel__eyebrow">{{ eyebrowLabel }}</p>
    <h4 class="state-panel__title">{{ title }}</h4>
    <p v-if="body" class="state-panel__body">{{ body }}</p>
    <button
      v-if="actionLabel"
      type="button"
      class="state-panel__action"
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
</script>

<style scoped>
.state-panel {
  border-radius: 14px;
  border: 1px solid rgba(95, 111, 132, 0.24);
  background: linear-gradient(170deg, rgba(235, 242, 249, 0.8), rgba(250, 252, 255, 0.95));
  padding: 14px;
  display: grid;
  gap: 8px;
}

.state-panel--error {
  border-color: rgba(151, 36, 36, 0.28);
  background: linear-gradient(170deg, rgba(255, 238, 234, 0.9), rgba(255, 250, 248, 0.98));
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
  color: #44566f;
}

.state-panel--error .state-panel__eyebrow {
  color: #7a2e2e;
}

.state-panel__body {
  color: #53677f;
}

.state-panel--error .state-panel__body {
  color: #7f3c34;
}

.state-panel__action {
  width: fit-content;
  border-radius: 10px;
  border: 1px solid rgba(95, 111, 132, 0.24);
  background: rgba(255, 255, 255, 0.85);
  color: #32465c;
  padding: 8px 12px;
  cursor: pointer;
}

.state-panel--error .state-panel__action {
  border-color: rgba(151, 36, 36, 0.24);
  color: #6f2a21;
}
</style>
