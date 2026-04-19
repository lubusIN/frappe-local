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
      <div class="confirm-header">
        <div class="confirm-icon">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
        <div>
          <h3 class="confirm-title" :id="titleId">{{ title }}</h3>
          <p :id="messageId" class="confirm-message">{{ message }}</p>
        </div>
      </div>

      <label v-if="confirmationPhrase" class="confirm-field">
        <span>Type <strong>{{ confirmationPhrase }}</strong> to continue</span>
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
          class="confirm-btn"
          aria-label="Cancel this confirmation dialog"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <button
          ref="confirmBtnRef"
          type="button"
          class="confirm-btn confirm-btn--danger"
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
import { computed, watch, ref } from 'vue';

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
  background: rgba(0, 0, 0, 0.4);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 40;
  backdrop-filter: blur(2px);
}

.confirm-card {
  width: min(420px, 100%);
  border-radius: 8px;
  background: var(--surface-card, #ffffff);
  border: 1px solid var(--border-light, #e2e2e3);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16);
  padding: 20px;
  display: grid;
  gap: 16px;
}

.confirm-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.confirm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 8px;
  background: var(--red-light, #fef2f2);
  color: var(--red-text, #b91c1c);
}

.confirm-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1f1f1f);
}

.confirm-message {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  line-height: 1.5;
}

.confirm-field {
  display: grid;
  gap: 6px;
}

.confirm-field span {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.confirm-field input {
  border-radius: 6px;
  border: 1px solid var(--border-default, #d1d1d2);
  background: var(--surface-card, #ffffff);
  padding: 6px 10px;
  font-size: 13px;
}

.confirm-field input:focus {
  outline: none;
  border-color: var(--text-primary, #1f1f1f);
  box-shadow: 0 0 0 1px var(--text-primary, #1f1f1f);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-btn {
  min-height: 28px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid var(--border-default, #d1d1d2);
  background: var(--surface-card, #ffffff);
  color: var(--text-primary, #1f1f1f);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
}

.confirm-btn:hover:not(:disabled) {
  background: var(--surface-hover, #f2f2f3);
}

.confirm-btn--danger {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}

.confirm-btn--danger:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
