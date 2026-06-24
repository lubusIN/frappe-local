<template>
  <div class="flex flex-col gap-6">
    <DiagnosticsPanel
      :report="report"
      :running="running"
      :fixing="fixing"
      :error="error"
      @run="run"
      @fix="fix"
    >
      <template #summary-action>
        <div class="flex flex-col gap-4 rounded-lg border border-outline-red-3 bg-surface-red-2 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-red-8">
              <IconRotateCcw class="size-5" />
            </div>
            <div class="min-w-0">
              <h3 class="text-base-semibold text-ink-red-8">
                Reset Environment
              </h3>
              <p class="mt-1 text-sm leading-5 text-ink-gray-6">
                Clear local data and runtime containers.
              </p>
            </div>
          </div>
          <div class="flex justify-end">
            <Button
              theme="red"
              variant="solid"
              :icon="IconRotateCcw"
              :loading="resetting"
              :disabled="running || fixing || resetting"
              @click="onOpenResetConfirm"
            >
              Reset
            </Button>
          </div>
        </div>
      </template>
    </DiagnosticsPanel>

    <ConfirmationDialog
      :open="showResetConfirm"
      title="Reset"
      message="This will permanently remove all local benches/sites data, containers, and the dedicated Podman VM. Type RESET to continue."
      confirm-label="Reset"
      confirmation-phrase="RESET"
      :typed-value="ResetTypedValue"
      @update:typed-value="onUpdateResetTypedValue"
      @cancel="onCancelReset"
      @confirm="onConfirmReset"
    />

    <Teleport to="body">
      <div
        v-if="resetting"
        class="fixed inset-0 z-[9999] bg-surface-base/90 flex flex-col items-center justify-center backdrop-blur-sm"
      >
        <Logo class="w-24 h-24 mb-6 text-ink-gray-9 animate-pulse" />
        <LoadingIndicator class="w-8 h-8 mb-4 text-ink-gray-9" />
        <h2 class="text-3xl-semibold text-ink-gray-9">
          Resetting Frappe Local
        </h2>
        <p class="mt-2 text-ink-gray-6">
          This may take a few moments. Please do not close the application.
        </p>
        <div class="mt-6">
          <TaskTimer
            v-if="resetting"
            :start-time="resetStartTime"
            :running="resetting"
            size-class="text-sm"
            color-class="text-ink-gray-5"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { Button, LoadingIndicator, toast } from 'frappe-ui';
import IconPlay from '~icons/lucide/play';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import DiagnosticsPanel from '@frappe-local/renderer/components/DiagnosticsPanel.vue';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import Logo from '@frappe-local/renderer/components/ui/Logo.vue';
import TaskTimer from '@frappe-local/renderer/components/ui/TaskTimer.vue';
import { ACTIVITIES_STORAGE_KEY, useDiagnostics } from '@frappe-local/renderer/composables/system';
import { usePageHeaderActions } from '@frappe-local/renderer/composables/ui';

const { report, running, fixing, resetting, error, run, fix, Reset } = useDiagnostics();
const { setActions, clearActions } = usePageHeaderActions();

const showResetConfirm = ref(false);
const ResetTypedValue = ref('');
const resetStartTime = ref(0);

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

  resetStartTime.value = Date.now();
  const ok = await Reset();
  if (!ok) {
    return;
  }

  localStorage.removeItem(ACTIVITIES_STORAGE_KEY);
  toast.success('Development state reset. Reloading app');
  window.location.reload();
};

const headerActions = computed(() => [
  {
    id: 'diagnostics-run',
    label: running.value ? 'Running' : 'Run',
    variant: 'primary' as const,
    disabled: running.value || resetting.value,
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
