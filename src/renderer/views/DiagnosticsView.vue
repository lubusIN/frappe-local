<template>
  <div class="flex flex-col gap-4">
    <DiagnosticsPanel
      :report="report"
      :running="running"
      :fixing="fixing"
      :error="error"
      @run="run"
      @fix="fix"
    />

    <section class="p-4 border border-red-200 rounded-xl bg-red-50/40">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-sm font-semibold text-ink-red-4">
            Danger Zone
          </h3>
          <p class="mt-1 text-sm text-ink-gray-6">
            Remove all local Local Bench storage and teardown all local-bench containers to start from a clean slate.
          </p>
        </div>
        <Button
          theme="red"
          variant="solid"
          :loading="resetting"
          :disabled="running || fixing || resetting"
          @click="onOpenResetConfirm"
        >
          Reset
        </Button>
      </div>
    </section>

    <ConfirmationDialog
      :open="showResetConfirm"
      title="Reset"
      message="This will permanently remove all local benches/sites data and tear down local-bench containers. Type RESET to continue."
      confirm-label="Reset"
      confirmation-phrase="RESET"
      :typed-value="ResetTypedValue"
      @update:typed-value="onUpdateResetTypedValue"
      @cancel="onCancelReset"
      @confirm="onConfirmReset"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import IconPlay from '~icons/lucide/play';
import { Button, toast } from 'frappe-ui';
import DiagnosticsPanel from '../components/DiagnosticsPanel.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import { useDiagnostics } from '../composables/useDiagnostics';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';

const { report, running, fixing, resetting, error, run, fix, Reset } = useDiagnostics();
const { setActions, clearActions } = usePageHeaderActions();

const showResetConfirm = ref(false);
const ResetTypedValue = ref('');

const onOpenResetConfirm = (): void => {
  showResetConfirm.value = true;
  ResetTypedValue.value = '';
};

const onCancelReset = (): void => {
  showResetConfirm.value = false;
  ResetTypedValue.value = '';
};

const onUpdateResetTypedValue = (value: string): void => {
  ResetTypedValue.value = value;
};

const onConfirmReset = async (): Promise<void> => {
  onCancelReset();

  const ok = await Reset();
  if (!ok) {
    return;
  }

  toast.success('Development state reset. Reloading app...');
  window.location.reload();
};

const headerActions = computed(() => [
  {
    id: 'diagnostics-run',
    label: running.value ? 'Running' : 'Run',
    variant: 'primary' as const,
    disabled: running.value,
    loading: running.value,
    icon: IconPlay,
    onClick: () => {
      void run();
    },
  },
]);

watch(headerActions, (actions) => {
  setActions(actions);
}, { immediate: true });

onBeforeUnmount(() => {
  clearActions();
});
</script>
