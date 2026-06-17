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
            Remove all Frappe Local data, containers, and the dedicated Podman VM to start from a clean slate.
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
        class="fixed inset-0 z-[9999] bg-white/90 flex flex-col items-center justify-center backdrop-blur-sm"
      >
        <Logo class="w-24 h-24 mb-6 text-ink-gray-9 animate-pulse" />
        <LoadingIndicator class="w-8 h-8 mb-4 text-ink-gray-9" />
        <h2 class="text-xl font-semibold text-ink-gray-9">
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import IconPlay from '~icons/lucide/play';
import { Button, toast, LoadingIndicator } from 'frappe-ui';
import DiagnosticsPanel from '../components/DiagnosticsPanel.vue';
import ConfirmationDialog from '../components/dialogs/ConfirmationDialog.vue';
import Logo from '../components/ui/Logo.vue';
import TaskTimer from '../components/ui/TaskTimer.vue';
import { useDiagnostics } from '../composables/system/useDiagnostics';
import { usePageHeaderActions } from '../composables/ui/usePageHeaderActions';
import { ACTIVITIES_STORAGE_KEY } from '../composables/system/useProgressCenter';

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
