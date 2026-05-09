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
          :loading="nuking"
          :disabled="running || fixing || nuking"
          @click="onOpenNukeConfirm"
        >
          Nuke Dev State
        </Button>
      </div>
    </section>

    <ConfirmationDialog
      :open="showNukeConfirm"
      title="Nuke Dev State"
      message="This will permanently remove all local benches/sites data and tear down local-bench containers. Type NUKE to continue."
      confirm-label="Nuke"
      confirmation-phrase="NUKE"
      :typed-value="nukeTypedValue"
      @update:typed-value="onUpdateNukeTypedValue"
      @cancel="onCancelNuke"
      @confirm="onConfirmNuke"
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

const { report, running, fixing, nuking, error, run, fix, nuke } = useDiagnostics();
const { setActions, clearActions } = usePageHeaderActions();

const showNukeConfirm = ref(false);
const nukeTypedValue = ref('');

const onOpenNukeConfirm = (): void => {
  showNukeConfirm.value = true;
  nukeTypedValue.value = '';
};

const onCancelNuke = (): void => {
  showNukeConfirm.value = false;
  nukeTypedValue.value = '';
};

const onUpdateNukeTypedValue = (value: string): void => {
  nukeTypedValue.value = value;
};

const onConfirmNuke = async (): Promise<void> => {
  const ok = await nuke();
  if (!ok) {
    return;
  }

  toast.success('Development state nuked. Reloading app...');
  onCancelNuke();
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
