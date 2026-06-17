<template>
  <div class="flex flex-col w-full h-full min-w-0">
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

    <div
      v-else-if="report"
      class="flex flex-col flex-1 min-h-0 gap-4"
    >
      <Alert
        :title="summaryTitle"
        :description="summaryDescription"
        :dismissible="false"
        :theme="summaryTheme"
      />

      <ListView
        :columns="diagnosticsColumns"
        :rows="diagnosticsRows"
        row-key="id"
        :options="diagnosticsListOptions"
        class="flex-1 w-full min-w-0"
      >
        <template #cell="{ row, column }">
          <template v-if="column.key === 'check'">
            <div class="min-w-0 py-4 pr-4">
              <div class="text-sm-medium text-ink-gray-9">
                {{ row.check.title }}
              </div>
              <div class="mt-2 text-sm leading-6 text-ink-gray-6">
                {{ row.check.description }}
              </div>

              <div
                v-if="row.check.remediation"
                class="mt-2 text-sm leading-6 text-ink-gray-6"
              >
                <div class="break-words">
                  <span class="font-medium text-ink-gray-9">Remediation:</span> {{ row.check.remediation }}
                </div>
              </div>

              <div
                v-if="row.check.type === 'runtime-health' && row.check.status === 'failed'"
                class="mt-2"
              >
                <Button
                  variant="subtle"
                  size="sm"
                  theme="red"
                  :loading="fixing"
                  @click="$emit('fix', row.check.type)"
                >
                  Fix
                </Button>
              </div>
            </div>
          </template>

          <template v-else-if="column.key === 'status'">
            <div class="py-4">
              <Badge
                :theme="statusTheme(row.status, 'diagnostic')"
                variant="subtle"
                size="md"
              >
                {{ formatStatus(row.status, 'diagnostic') }}
              </Badge>
            </div>
          </template>
        </template>
      </ListView>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Alert, Badge, Button, ListView } from 'frappe-ui';
import { computed, reactive } from 'vue';
import type { DiagnosticsCheckResult, DiagnosticsCheckStatus, DiagnosticsReport } from '../../shared/domain/diagnostics';
import StatePanel from './ui/StatePanel.vue';
import { formatStatus, statusTheme } from '../utils/format';

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

const summaryTitle = computed(() => {
  if (props.running) return 'Running diagnostics';
  if (!props.report) return 'No diagnostics report';
  if (props.report.hasCriticalIssues) return 'Critical issues found';
  if (props.report.hasWarnings) return 'Warnings found';
  return 'All checks passed';
});

const summaryDescription = computed(() => {
  if (!props.report) return '';
  return `Last checked ${formattedCompletedAt.value}`;
});

const summaryTheme = computed<'blue' | 'red' | 'yellow' | 'green' | undefined>(() => {
  if (props.running) return 'blue';
  if (!props.report) return undefined;
  if (props.report.hasCriticalIssues) return 'red';
  if (props.report.hasWarnings) return 'yellow';
  return 'green';
});

const formattedCompletedAt = computed(() => {
  if (!props.report) return '';

  return new Date(props.report.completedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
});

const statusPriority: Record<DiagnosticsCheckStatus, number> = {
  failed: 0,
  warning: 1,
  skipped: 2,
  passed: 3,
};

const typePriority: Record<DiagnosticsCheckResult['type'], number> = {
  'runtime-health': 0,
  'runtime-preference': 1,
  'storage-access': 2,
  'path-writability': 3,
};

const sortedChecks = computed(() => {
  if (!props.report) return [];

  return [...props.report.checks].sort((left, right) => {
    const statusDifference = statusPriority[left.status] - statusPriority[right.status];
    if (statusDifference !== 0) return statusDifference;

    const typeDifference = typePriority[left.type] - typePriority[right.type];
    if (typeDifference !== 0) return typeDifference;

    return left.title.localeCompare(right.title);
  });
});

const diagnosticsRows = computed(() =>
  sortedChecks.value.map((check) => ({
    id: `${check.type}-${check.title}`,
    check,
    status: check.status,
  }))
);

const diagnosticsColumns = reactive([
  { label: 'Check', key: 'check', width: 'minmax(90%, 500px)' },
  { label: 'Status', key: 'status'},
]);

const diagnosticsListOptions = {
  selectable: false,
  showTooltip: false,
  resizeColumn: false,
  rowHeight: 'auto',
};


</script>
