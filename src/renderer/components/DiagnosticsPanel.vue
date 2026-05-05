<template>
  <div class="diagnostics-panel flex flex-col h-full">
    <StatePanel
      v-if="error"
      kind="error"
      title="Diagnostics failed"
      :body="error"
      action-label="Retry"
      @action="$emit('run')"
    />

    <StatePanel
      v-else-if="!report && !running"
      kind="empty"
      title="No report"
      body="Run diagnostics to verify environment readiness."
    />

    <StatePanel
      v-else-if="running && !report"
      kind="loading"
      title="Running..."
      body="Inspecting local dependencies."
    />

    <template v-else-if="report">
      <!-- Summary Alert -->
      <div 
        class="flex items-center gap-4 p-4 border rounded-lg bg-white shadow-sm mb-6"
        :class="summaryStatusClasses.iconBg"
      >
        <div class="shrink-0 p-2 rounded-md bg-white shadow-sm">
          <component :is="summaryIcon" class="w-4 h-4" :class="summaryStatusClasses.iconText" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-900 break-words leading-tight">{{ summaryText }}</p>
          <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
            v{{ report.appVersion }} <span class="mx-1 opacity-20">/</span> {{ report.completedAt }}
          </p>
        </div>
      </div>

      <!-- Official ListView -->
      <ListView
        :columns="diagnosticsColumns"
        :rows="report.checks"
        row-key="title"
        :options="diagnosticsListOptions"
        class="flex-1 min-h-0"
      >
        <template #cell="{ column, row }">
          <template v-if="column.key === 'check'">
            <div class="py-3 pr-4 flex flex-col min-w-0">
              <div class="text-sm font-bold text-gray-900 break-all leading-tight whitespace-normal">{{ row.title }}</div>
              <div class="text-xs text-gray-500 mt-1 leading-relaxed break-all whitespace-normal">{{ row.description }}</div>
              
              <div v-if="row.remediation" class="mt-3 p-3 bg-red-50 text-red-700 border border-red-100 rounded text-xs leading-relaxed break-all whitespace-normal">
                <span class="font-bold">Remediation:</span> {{ row.remediation }}
                <div v-if="row.type === 'runtime-health' && row.status === 'failed'" class="mt-2">
                  <Button
                    variant="subtle"
                    size="sm"
                    theme="red"
                    :loading="fixing"
                    @click="$emit('fix', row.type)"
                  >
                    Fix
                  </Button>
                </div>
              </div>
            </div>
          </template>
          
          <template v-else-if="column.key === 'status'">
            <div class="flex items-center h-full pt-3">
              <Badge
                :theme="getBadgeTheme(row.status)"
                variant="subtle"
                size="sm"
                class="capitalize font-semibold"
              >
                {{ row.status }}
              </Badge>
            </div>
          </template>
        </template>
      </ListView>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Badge, Button, ListView } from 'frappe-ui';
import IconActivity from '~icons/lucide/activity';
import IconShieldCheck from '~icons/lucide/shield-check';
import IconShieldAlert from '~icons/lucide/shield-alert';
import type { DiagnosticsReport } from '../../shared/domain/diagnostics';
import StatePanel from './StatePanel.vue';

const props = defineProps<{
  report: DiagnosticsReport | null;
  running: boolean;
  fixing?: boolean;
  error: string | null;
}>();

defineEmits<{
  run: [];
  fix: [checkType: string];
}>();

const summaryText = computed(() => {
  if (props.running) return 'Running diagnostics...';
  if (!props.report) return 'No report recorded.';
  return props.report.summary;
});

const summaryIcon = computed(() => {
  if (props.running) return IconActivity;
  if (!props.report) return IconShieldCheck;
  if (props.report.hasCriticalIssues) return IconShieldAlert;
  if (props.report.hasWarnings) return IconShieldAlert;
  return IconShieldCheck;
});

const summaryStatusClasses = computed(() => {
  if (props.running) return { iconBg: 'bg-blue-50/50', iconText: 'text-blue-600' };
  if (!props.report) return { iconBg: 'bg-gray-50/50', iconText: 'text-gray-600' };
  if (props.report.hasCriticalIssues) return { iconBg: 'bg-red-50/50', iconText: 'text-red-600' };
  if (props.report.hasWarnings) return { iconBg: 'bg-orange-50/50', iconText: 'text-orange-600' };
  return { iconBg: 'bg-green-50/50', iconText: 'text-green-600' };
});

const diagnosticsColumns = reactive([
  { label: 'Check', key: 'check', width: 3 },
  { label: 'Status', key: 'status', width: '120px' },
]);

const diagnosticsListOptions = {
  selectable: false,
  showTooltip: true,
  resizeColumn: true,
};

const getBadgeTheme = (status: string) => {
  switch (status) {
    case 'passed':
    case 'ok':
      return 'green';
    case 'failed':
    case 'error':
      return 'red';
    case 'warning':
    case 'warn':
      return 'orange';
    case 'skipped':
      return 'gray';
    default:
      return 'gray';
  }
};
</script>

<style scoped>
.diagnostics-panel {
  width: 100%;
}

:deep(.frappe-list-row) {
  height: auto !important;
  min-height: 44px;
}

:deep(.frappe-list-cell) {
  height: auto !important;
  white-space: normal !important;
}
</style>
