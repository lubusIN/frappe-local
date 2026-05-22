<template>
  <section
    class="flex items-start gap-3 rounded-lg border p-4 select-text"
    :class="tone === 'warning' ? 'border-outline-amber-2 bg-surface-amber-2 text-ink-amber-3' : 'border-outline-red-2 bg-surface-red-2 text-ink-red-4'"
    role="alert"
    aria-live="polite"
    aria-atomic="true"
  >
    <IconAlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
    <div class="grid gap-1.5">
      <h4
        :id="titleId"
        class="m-0 text-[13px] font-semibold"
      >
        {{ notice.title }}
      </h4>
      <p
        :id="reasonId"
        class="m-0 text-[13px] leading-relaxed"
      >
        {{ notice.reason }}
      </p>

      <ul
        v-if="notice.steps.length > 0"
        class="m-0 mt-1 list-disc space-y-1 pl-5 text-[13px] leading-relaxed"
        :aria-describedby="reasonId"
      >
        <li
          v-for="step in notice.steps"
          :key="step"
        >
          {{ step }}
        </li>
      </ul>

      <div
        v-if="notice.actions.length > 0"
        class="mt-1 flex flex-wrap gap-2"
      >
        <template
          v-for="action in notice.actions"
          :key="action.id"
        >
          <RouterLink
            v-if="action.to"
            class="inline-flex items-center rounded-md border border-current px-2.5 py-1 text-xs font-medium no-underline hover:bg-surface-white/50"
            :to="action.to"
            :aria-label="`${action.label}: navigate to resolve this error`"
          >
            {{ action.label }}
          </RouterLink>
          <Button
            v-else
            class="inline-flex items-center"
            variant="subtle"
            :aria-label="`${action.label}: take action to resolve this error`"
            @click="$emit('action', action.id)"
          >
            {{ action.label }}
          </Button>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Button } from 'frappe-ui';
import IconAlertTriangle from '~icons/lucide/alert-triangle';
import type { ErrorRemediationNotice } from '../error-remediation';

defineProps<{
  notice: ErrorRemediationNotice;
  tone?: 'danger' | 'warning';
}>();

defineEmits<{
  (event: 'action', actionId: string): void;
}>();

const uid = Math.random().toString(36).slice(2, 11);
const titleId = computed(() => `error-notice-title-${uid}`);
const reasonId = computed(() => `error-notice-reason-${uid}`);
</script>
