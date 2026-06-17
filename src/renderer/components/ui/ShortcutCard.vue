<template>
  <component
    :is="is"
    :to="to"
    :class="[
      'block w-full rounded-lg border border-outline-gray-2 bg-surface-base p-4 transition-colors hover:bg-surface-gray-1 hover:border-outline-gray-3',
      { 'no-underline text-inherit': to },
      { 'cursor-pointer focus-visible:outline-2 focus-visible:outline-outline-gray-3 focus-visible:outline-offset-2': !to }
    ]"
    :role="!to ? 'button' : undefined"
    :tabindex="!to ? 0 : undefined"
    @click="onClick"
    @keydown="onKeydown"
  >
    <div class="flex items-start gap-3">
      <div class="flex items-center justify-center size-9 min-w-9 rounded-lg bg-surface-gray-2 text-ink-gray-5">
        <component
          :is="icon"
          v-if="icon"
          class="size-5"
        />
      </div>
      <div>
        <p class="m-0 text-[13px] font-semibold text-ink-gray-9 leading-snug">
          {{ title }}
        </p>
        <p class="m-0 mt-0.5 text-xs text-ink-gray-5 leading-normal">
          {{ description }}
        </p>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { Component } from 'vue';

const props = defineProps<{
  title: string;
  description: string;
  icon?: Component;
  to?: string;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent | KeyboardEvent): void;
}>();

const is = computed(() => (props.to ? RouterLink : 'div'));

const onClick = (event: MouseEvent) => {
  if (!props.to) {
    emit('click', event);
  }
};

const onKeydown = (event: KeyboardEvent) => {
  if (!props.to && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    emit('click', event);
  }
};
</script>
