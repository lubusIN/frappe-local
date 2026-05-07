<template>
  <DiagnosticsPanel
    :report="report"
    :running="running"
    :fixing="fixing"
    :error="error"
    @run="run"
    @fix="fix"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import IconPlay from '~icons/lucide/play';
import DiagnosticsPanel from '../components/DiagnosticsPanel.vue';
import { useDiagnostics } from '../composables/useDiagnostics';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';

const { report, running, fixing, error, run, fix } = useDiagnostics();
const { setActions, clearActions } = usePageHeaderActions();

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
