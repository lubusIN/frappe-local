<template>
  <Dialog
    :model-value="open"
    :title="title"
    size="md"
    :dismissible="false"
    @update:model-value="onOpenChange"
  >
    <template #title>
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-8 h-8 rounded-lg min-w-8 bg-surface-red-2 text-ink-red-8">
          <IconAlertTriangle class="h-[18px] w-[18px]" />
        </div>
        <h3 class="m-0 text-sm-semibold text-ink-gray-9">
          {{ title }}
        </h3>
      </div>
    </template>

    <template #default>
      <p class="mb-4 text-[13px] leading-relaxed text-ink-gray-5">
        {{ message }}
      </p>
      <FormControl
        v-if="confirmationPhrase"
        :model-value="typedValue"
        :label="`Type ${confirmationPhrase} to continue`"
        type="text"
        :placeholder="confirmationPhrase"
        variant="outline"
        @update:model-value="onTypedValueUpdate"
        @keydown.enter="handleEnter"
      />
    </template>

    <template #actions>
      <div class="flex justify-end gap-2">
        <Button
          size="md"
          variant="subtle"
          @click="$emit('cancel')"
        >
          Cancel
        </Button>
        <Button
          ref="confirmButtonRef"
          size="md"
          variant="solid"
          theme="red"
          :disabled="confirmDisabled"
          @click="$emit('confirm')"
        >
          {{ confirmLabel }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { Button, Dialog, FormControl } from 'frappe-ui';
import IconAlertTriangle from '~icons/lucide/alert-triangle';
import { computed, nextTick, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmationPhrase?: string | null;
    typedValue?: string;
  }>(),
  {
    confirmLabel: 'Confirm',
    confirmationPhrase: null,
    typedValue: '',
  }
);

const emit = defineEmits<{
  (event: 'confirm'): void;
  (event: 'cancel'): void;
  (event: 'update:typedValue', value: string): void;
}>();

const confirmButtonRef = ref<InstanceType<typeof Button> | null>(null);

const confirmDisabled = computed(() => {
  if (!props.confirmationPhrase) {
    return false;
  }

  return props.typedValue.trim() !== props.confirmationPhrase;
});

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen || props.confirmationPhrase) {
      return;
    }

    await nextTick();
    confirmButtonRef.value?.$el?.focus?.();
  }
);

const onTypedValueUpdate = (value: string): void => {
  emit('update:typedValue', value);
};

const onOpenChange = (value: boolean): void => {
  if (!value) {
    emit('cancel');
  }
};

const handleEnter = (): void => {
  if (!confirmDisabled.value) {
    emit('confirm');
  }
};
</script>
