<template>
  <section
    class="flex items-start gap-2.5 rounded-lg border p-4"
    :class="{
      'border-outline-gray-2 bg-surface-white': kind === 'empty',
      'border-outline-gray-2 bg-surface-gray-2': kind === 'loading',
      'border-outline-red-2 bg-surface-red-2': kind === 'error',
    }"
    role="status"
    aria-live="polite"
    :aria-busy="kind === 'loading'"
    :aria-label="accessibilityLabel"
  >
    <div
      class="mt-0.5 min-w-4"
      :class="kind === 'error' ? 'text-ink-red-4' : 'text-ink-gray-5'"
    >
      <LoadingIndicator
        v-if="kind === 'loading'"
        class="h-4 w-4"
      />
      <IconInbox
        v-else-if="kind === 'empty'"
        class="h-4 w-4"
      />
      <IconAlertTriangle
        v-else
        class="h-4 w-4"
      />
    </div>
    <div class="min-w-0">
      <h4
        class="m-0 text-[13px] font-semibold"
        :class="kind === 'error' ? 'text-ink-red-4' : 'text-ink-gray-9'"
      >
        {{ title }}
      </h4>
      <p
        v-if="body"
        class="mt-1 text-[13px] leading-relaxed"
        :class="kind === 'error' ? 'text-ink-red-4' : 'text-ink-gray-6'"
      >
        {{ body }}
      </p>
      <Button
        v-if="actionLabel"
        class="mt-2"
        :theme="kind === 'error' ? 'red' : 'gray'"
        variant="subtle"
        :aria-label="actionAriaLabel"
        @click="$emit('action')"
      >
        {{ actionLabel }}
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button, LoadingIndicator } from 'frappe-ui';
import IconAlertTriangle from '~icons/lucide/alert-triangle';
import IconInbox from '~icons/lucide/inbox';

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
