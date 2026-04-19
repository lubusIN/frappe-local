<template>
  <div
    v-if="open"
    class="confirm-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :aria-describedby="messageId"
    @keydown.escape="handleEscape"
  >
    <section class="confirm-card" ref="cardRef">
      <p class="confirm-eyebrow">Confirmation required</p>
      <h3 class="confirm-title" :id="titleId">{{ title }}</h3>
      <p :id="messageId" class="confirm-message">{{ message }}</p>

      <label v-if="confirmationPhrase" class="confirm-field">
        <span>Type {{ confirmationPhrase }} to continue</span>
        <input
          ref="inputRef"
          :value="typedValue"
          type="text"
          :placeholder="confirmationPhrase"
          :aria-label="`Type ${confirmationPhrase} to confirm this action`"
          @input="onInput"
          @keydown.enter="handleEnter"
        />
      </label>

      <div class="confirm-actions">
        <button
          type="button"
          class="confirm-button"
          aria-label="Cancel this confirmation dialog"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <button
          ref="confirmBtnRef"
          type="button"
          class="confirm-button confirm-button--danger"
          :disabled="confirmDisabled"
          :aria-label="`${confirmLabel}: this action cannot be undone`"
          @click="$emit('confirm')"
          @keydown.enter="handleConfirmEnter"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref, onMounted } from 'vue';

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

const titleId = 'confirm-title';
const messageId = 'confirm-message';
const cardRef = ref<HTMLElement>();
const inputRef = ref<HTMLInputElement>();
const confirmBtnRef = ref<HTMLButtonElement>();

const confirmDisabled = computed(() => {
  if (!props.confirmationPhrase) {
    return false;
  }

  return props.typedValue.trim() !== props.confirmationPhrase;
});

// Focus management: auto-focus confirm button when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      // If there's a typed confirmation phrase, focus input; otherwise focus confirm button
      setTimeout(() => {
        if (props.confirmationPhrase && inputRef.value) {
          inputRef.value.focus();
        } else if (confirmBtnRef.value) {
          confirmBtnRef.value.focus();
        }
      }, 0);

      // Prevent body scroll when dialog is open
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll when dialog closes
      document.body.style.overflow = '';
    }
  }
);

const onInput = (event: Event): void => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:typedValue', value);
};

const handleEscape = (): void => {
  emit('cancel');
};

const handleEnter = (): void => {
  // If we have confirmation phrase and it matches, confirm on Enter
  if (props.confirmationPhrase && props.typedValue.trim() === props.confirmationPhrase) {
    emit('confirm');
  }
};

const handleConfirmEnter = (): void => {
  if (!confirmDisabled.value) {
    emit('confirm');
  }
};
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(22, 24, 29, 0.42);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 40;
}

.confirm-card {
  width: min(520px, 100%);
  border-radius: 16px;
  background: #fffbf7;
  border: 1px solid rgba(108, 41, 31, 0.2);
  box-shadow: 0 18px 48px rgba(32, 15, 10, 0.24);
  padding: 18px;
  display: grid;
  gap: 12px;
}

.confirm-eyebrow {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8a5030;
}

.confirm-title,
.confirm-message {
  margin: 0;
}

.confirm-message {
  color: #5d4533;
}

.confirm-field {
  display: grid;
  gap: 6px;
}

.confirm-field input {
  border-radius: 10px;
  border: 1px solid rgba(108, 41, 31, 0.25);
  background: #fff;
  padding: 9px 12px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-button {
  border-radius: 10px;
  border: 1px solid rgba(108, 41, 31, 0.18);
  padding: 9px 14px;
  background: rgba(108, 41, 31, 0.08);
  color: #5d2a1f;
  cursor: pointer;
}

.confirm-button--danger {
  background: rgba(156, 35, 35, 0.14);
  border-color: rgba(156, 35, 35, 0.22);
}

.confirm-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
