<template>
  <div class="flex flex-col gap-6">
    <PageHeader class="[-webkit-app-region:drag]">
      <h1 class="text-lg-medium truncate text-ink-gray-9">
        Diagnostics
      </h1>
      <div class="flex items-center gap-3 [-webkit-app-region:no-drag]">
        <Button
          variant="solid"
          :disabled="running || resetting"
          :loading="running"
          :icon-left="'lucide-play'"
          @click="run"
        >
          {{ running ? 'Running' : 'Run' }}
        </Button>
      </div>
    </PageHeader>

    <DiagnosticsPanel
      :report="report"
      :running="running"
      :fixing="fixing"
      :error="error"
      @run="run"
      @fix="fix"
    >
      <template #summary-action>
        <div class="flex flex-col gap-4 rounded-6 border border-outline-red-3 bg-surface-red-2 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-6 text-ink-red-7">
              <span
                class="lucide-rotate-ccw size-5"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0">
              <h3 class="text-base-semibold text-ink-red-7">
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
              :icon="'lucide-rotate-ccw'"
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
  </div>
</template>

<script setup lang="ts">
import { Button, toast } from 'frappe-ui';
import { ref } from 'vue';
import DiagnosticsPanel from '@frappe-local/renderer/components/DiagnosticsPanel.vue';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import { ACTIVITIES_STORAGE_KEY, useDiagnostics } from '@frappe-local/renderer/composables/system';
import { PageHeader } from 'frappe-ui';

const { report, running, fixing, resetting, error, run, fix, Reset } = useDiagnostics();

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
</script>
