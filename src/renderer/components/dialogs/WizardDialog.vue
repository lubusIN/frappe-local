<template>
  <Dialog
    :model-value="open"
    :options="{ title, size: '3xl' }"
    @update:model-value="$emit('update:open', $event)"
    @close="$emit('close')"
  >
    <template #body-content>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2.5 py-1" :class="{ 'px-0': compact }">
          <template v-for="(step, index) in steps" :key="step">
            <span :class="['text-[0.95rem] leading-tight tracking-[-0.01em]', currentStep === (index + 1) ? 'font-medium text-ink-gray-9' : 'font-normal text-ink-gray-5']">
              {{ step }}
            </span>
            <IconChevronRight v-if="index < steps.length - 1" class="size-[15px] shrink-0 text-ink-gray-5" />
          </template>
        </div>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="currentStep === steps.length ? $emit('submit') : $emit('next')"
        >
          <p
            v-if="errors && errors.length > 0"
            class="mb-4 text-sm text-ink-red-3"
          >
            {{ errors.join(' ') }}
          </p>

          <slot />
        </form>
      </div>
    </template>

    <template #actions>
      <div class="flex justify-end gap-3">
        <Button
          v-if="currentStep > 1"
          size="md"
          variant="subtle"
          @click="$emit('previous')"
        >
          Back
        </Button>
        <Button
          v-if="currentStep < steps.length"
          size="md"
          variant="solid"
          @click="$emit('next')"
        >
          Next
        </Button>
        <Button
          v-if="currentStep === steps.length"
          size="md"
          variant="solid"
          :loading="creating"
          :disabled="loading"
          @click="$emit('submit')"
        >
          {{ creating ? 'Creating…' : submitLabel }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { Button, Dialog } from 'frappe-ui';
import IconChevronRight from '~icons/lucide/chevron-right';

defineProps<{
  open: boolean;
  title: string;
  steps: string[];
  currentStep: number;
  errors?: string[];
  loading?: boolean;
  creating?: boolean;
  submitLabel: string;
  compact?: boolean;
}>();

defineEmits<{
  'update:open': [value: boolean];
  'close': [];
  'next': [];
  'previous': [];
  'submit': [];
}>();
</script>
