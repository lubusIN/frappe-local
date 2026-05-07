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
        :dismissable="false"
        :theme="summaryTheme"
      />

      <ListView
        :columns="diagnosticsColumns"
        :rows="diagnosticsRows"
        row-key="id"
        :options="diagnosticsListOptions"
        class="flex-1 w-full min-w-0"
      >
        <ListHeader>
          <ListHeaderItem
            v-for="column in diagnosticsColumns"
            :key="column.key"
            :item="column"
          />
        </ListHeader>

        <ListRows>
          <ListRow
            v-for="row in diagnosticsRows"
            :key="row.id"
            v-slot="{ column, item }"
            :row="row"
          >
            <template v-if="column.key === 'check'">
              <ListRowItem
                :item="item"
                :align="column.align"
              >
                <template #default>
                  <div class="min-w-0 py-4 pr-4">
                    <div class="text-sm font-medium text-ink-gray-9">
                      {{ item.title }}
                    </div>
                    <div class="mt-2 text-sm leading-6 text-ink-gray-6">
                      {{ item.description }}
                    </div>

                    <div
                      v-if="item.remediation"
                      class="mt-2 text-sm leading-6 text-ink-gray-6"
                    >
                      <div class="break-words">
                        <span class="font-medium text-ink-gray-9">Remediation:</span> {{ item.remediation }}
                      </div>
                      <div
                        v-if="item.type === 'runtime-health' && item.status === 'failed'"
                        class="mt-2"
                      >
                        <Button
                          variant="subtle"
                          size="sm"
                          theme="red"
                          :loading="fixing"
                          @click="$emit('fix', item.type)"
                        >
                          Fix
                        </Button>
                      </div>
                    </div>
                  </div>
                </template>
              </ListRowItem>
            </template>

            <template v-else-if="column.key === 'status'">
              <ListRowItem
                :item="item"
                :align="column.align"
              >
                <template #default>
                  <div class="py-4">
                    <Badge
                      :theme="getBadgeTheme(item)"
                      variant="subtle"
                      size="md"
                    >
                      {{ formatStatus(item) }}
                    </Badge>
                  </div>
                </template>
              </ListRowItem>
            </template>
          </ListRow>
        </ListRows>
      </ListView>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Alert, Badge, Button, ListHeader, ListHeaderItem, ListRow, ListRowItem, ListRows, ListView } from 'frappe-ui';
import type { DiagnosticsCheckResult, DiagnosticsCheckStatus, DiagnosticsReport } from '../../shared/domain/diagnostics';
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

const formatStatus = (status: string) => {
  if (status === 'ok') return 'Passed';
  if (status === 'warn') return 'Warning';
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
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
