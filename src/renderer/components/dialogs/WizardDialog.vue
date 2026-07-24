<template>
  <Dialog
    :model-value="open"
    :title="title"
    :size="size || '3xl'"
    @update:model-value="$emit('update:open', $event)"
    @close="$emit('close')"
  >
    <template #default>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3 mb-2">
          <div class="text-[0.95rem] font-medium text-ink-gray-9 leading-tight">
            {{ steps[currentStep - 1] }}
          </div>

          <div class="flex items-center gap-2">
            <div
              v-for="(_, index) in steps"
              :key="index"
              class="h-1 flex-1 rounded-full transition-colors duration-200"
              :class="currentStep > index ? 'bg-gray-900 dark:bg-gray-100' : 'bg-surface-gray-2'"
            />
          </div>
        </div>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="currentStep === steps.length ? $emit('submit') : $emit('next')"
        >
          <ErrorMessage
            v-if="errors && errors._global"
            class="mb-2"
            :message="errors._global"
          />

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
import { Button, Dialog, ErrorMessage } from 'frappe-ui';
import type { DialogSize } from 'frappe-ui';

defineProps<{
  open: boolean;
  title: string;
  size?: DialogSize;
  steps: string[];
  currentStep: number;
  errors?: Record<string, string>;
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
