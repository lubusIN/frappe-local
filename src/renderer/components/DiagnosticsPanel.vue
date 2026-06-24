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
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section
          class="flex flex-col gap-4 rounded-lg border bg-surface-base p-4 sm:flex-row sm:items-start sm:justify-between"
          :class="summaryCardClass"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-lg"
              :class="summaryIconClass"
            >
              <component
                :is="summaryIcon"
                class="size-5"
              />
            </div>
            <div class="min-w-0">
              <h2 class="text-base-semibold text-ink-gray-9">
                {{ summaryTitle }}
              </h2>
              <p class="mt-1 text-sm leading-5 text-ink-gray-6">
                {{ summaryDescription }}
              </p>
            </div>
          </div>

          <Badge
            :theme="summaryTheme"
            variant="subtle"
            size="md"
            class="shrink-0"
          >
            {{ summaryBadgeLabel }}
          </Badge>
        </section>

        <slot name="summary-action" />
      </div>

      <section class="flex flex-col gap-3">
        <div>
          <h2 class="text-base-semibold text-ink-gray-9">
            Checks
          </h2>
          <p class="mt-1 text-sm text-ink-gray-6">
            Runtime, storage, and path readiness for local development.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <article
            v-for="check in sortedChecks"
            :key="`${check.type}-${check.title}`"
            class="flex flex-col rounded-lg border bg-surface-base p-3 transition-colors"
            :class="cardClass(check.status)"
          >
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="flex items-center gap-1.5 text-sm-semibold text-ink-gray-9">
                  <component
                    :is="checkIcon(check)"
                    class="size-3.5 shrink-0 text-ink-gray-5"
                  />
                  <span class="min-w-0 truncate">{{ displayTitle(check) }}</span>
                  <Popover
                    v-if="hasMoreDetails(check)"
                    trigger="hover"
                    placement="top-end"
                    popover-class="w-80"
                    :hover-delay="0.2"
                  >
                    <template #target>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        label="Show check details"
                        :icon="IconInfo"
                      />
                    </template>
                    <template #body-main>
                      <div class="space-y-3 p-3 text-sm leading-6 text-ink-gray-6">
                        <div
                          v-for="detail in infoDetails(check)"
                          :key="detail.label"
                        >
                          <div class="text-xs-semibold uppercase text-ink-gray-5">
                            {{ detail.label }}
                          </div>
                          <p class="mt-1 break-words">
                            {{ detail.value }}
                          </p>
                        </div>
                      </div>
                    </template>
                  </Popover>
                </h3>
                <p class="mt-1 text-sm leading-5 text-ink-gray-6">
                  {{ conciseDescription(check) }}
                </p>
              </div>

              <div
                class="flex size-7 shrink-0 items-center justify-center rounded-full"
                :class="statusIconClass(check.status)"
                :title="formatStatus(check.status, 'diagnostic')"
              >
                <component
                  :is="statusIcon(check.status)"
                  class="size-3.5"
                />
              </div>
            </div>

            <div class="mt-3 flex items-center justify-between gap-3">
              <Badge
                v-if="check.status !== 'passed'"
                :theme="statusTheme(check.status, 'diagnostic')"
                variant="subtle"
                size="md"
              >
                {{ formatStatus(check.status, 'diagnostic') }}
              </Badge>

              <div class="ml-auto flex items-center gap-2">
                <Button
                  v-if="canFix(check)"
                  variant="subtle"
                  size="sm"
                  theme="red"
                  :icon="IconWrench"
                  :loading="fixing"
                  @click="$emit('fix', check.type)"
                >
                  Fix
                </Button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Badge, Button, Popover } from 'frappe-ui';
import IconAlertTriangle from '~icons/lucide/alert-triangle';
import IconCheck from '~icons/lucide/check';
import IconCircleDashed from '~icons/lucide/circle-dashed';
import IconCloud from '~icons/lucide/cloud';
import IconDatabase from '~icons/lucide/database';
import IconFolder from '~icons/lucide/folder';
import IconHardDrive from '~icons/lucide/hard-drive';
import IconInfo from '~icons/lucide/info';
import IconMonitorCog from '~icons/lucide/monitor-cog';
import IconRoute from '~icons/lucide/route';
import IconWrench from '~icons/lucide/wrench';
import IconX from '~icons/lucide/x';
import { computed, type Component } from 'vue';
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

const summaryBadgeLabel = computed(() => {
  if (props.running) return 'Checking';
  if (!props.report) return 'Not checked';
  if (props.report.hasCriticalIssues) return 'Needs attention';
  if (props.report.hasWarnings) return 'Warnings';
  return 'Ready';
});

const summaryIcon = computed<Component>(() => {
  if (props.running) return IconCircleDashed;
  if (!props.report) return IconInfo;
  if (props.report.hasCriticalIssues) return IconX;
  if (props.report.hasWarnings) return IconAlertTriangle;
  return IconCheck;
});

const summaryCardClass = computed(() => {
  if (props.running) return 'border-outline-blue-3';
  if (!props.report) return 'border-outline-gray-2';
  if (props.report.hasCriticalIssues) return 'border-outline-red-3';
  if (props.report.hasWarnings) return 'border-outline-amber-3';
  return 'border-outline-gray-2';
});

const summaryIconClass = computed(() => {
  if (props.running) return 'bg-surface-blue-2 text-ink-blue-6';
  if (!props.report) return 'bg-surface-gray-2 text-ink-gray-6';
  if (props.report.hasCriticalIssues) return 'bg-surface-red-2 text-ink-red-8';
  if (props.report.hasWarnings) return 'bg-surface-amber-2 text-ink-amber-6';
  return 'bg-surface-green-2 text-ink-green-7';
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

const pathFromTitle = (title: string): string | null => {
  const match = title.match(/^[^:]+:\s*(.+)$/);
  return match?.[1] ?? null;
};

const displayTitle = (check: DiagnosticsCheckResult): string => {
  if (check.title.startsWith('Path Writability')) return 'App Data Path';
  if (check.title.startsWith('Directory Access')) return 'Storage Directory';
  if (check.title === 'Docker Compose Binary') return 'Docker Compose';
  if (check.title === 'Podman Binary') return 'Podman';
  if (check.title === 'Environment Requirement') return 'Runtime Platform';
  if (check.title === 'Orchestrator Connection') return 'Compose Connection';
  return check.title;
};

const conciseDescription = (check: DiagnosticsCheckResult): string => {
  if (check.title === 'Internet Connectivity') {
    return check.status === 'passed'
      ? 'Online and ready for downloads.'
      : 'Offline; downloads may be limited.';
  }

  if (check.title.startsWith('Path Writability')) {
    return check.status === 'passed'
      ? 'Writable.'
      : 'Not writable.';
  }

  if (check.title.startsWith('Directory Access')) {
    if (check.status === 'passed') return 'Accessible.';
    if (check.status === 'warning') return 'Will be created when needed.';
    return 'Not a directory.';
  }

  if (check.title === 'Docker Compose Binary') {
    return check.status === 'passed'
      ? 'Available.'
      : 'Unavailable.';
  }

  if (check.title === 'Podman Binary') {
    return check.status === 'passed'
      ? 'Available.'
      : 'Could not run.';
  }

  if (check.title === 'Environment Requirement') {
    return check.description.includes('No VM')
      ? 'No VM needed.'
      : 'Podman machine required.';
  }

  if (check.title === 'Podman Machine') {
    if (check.status === 'passed') return 'Running.';
    if (check.status === 'skipped') return 'Not required on this platform.';
    return 'Missing or stopped.';
  }

  if (check.title === 'Podman Engine') {
    return check.status === 'passed'
      ? 'Accepting connections.'
      : 'Cannot connect.';
  }

  if (check.title === 'Orchestrator Connection') {
    return check.status === 'passed'
      ? 'Connected.'
      : 'Cannot connect.';
  }

  return check.description;
};

const infoDetails = (check: DiagnosticsCheckResult): Array<{ label: string; value: string }> => {
  const details: Array<{ label: string; value: string }> = [];
  const pathValue = pathFromTitle(check.title);

  if (pathValue) {
    details.push({ label: 'Path', value: pathValue });
  }

  if (check.title === 'Orchestrator Connection' && check.status === 'passed') {
    const connection = check.description.match(/\svia\s(.+)$/)?.[1];
    if (connection) {
      details.push({ label: 'Connection', value: connection });
    }
  }

  const hasUsefulDescription =
    check.status !== 'passed' &&
    check.description !== conciseDescription(check) &&
    !pathValue;

  if (hasUsefulDescription) {
    details.push({ label: 'Details', value: check.description });
  }

  if (check.remediation) {
    details.push({ label: 'Fix', value: check.remediation });
  }

  return details;
};

const hasMoreDetails = (check: DiagnosticsCheckResult): boolean =>
  infoDetails(check).length > 0;

const checkIcon = (check: DiagnosticsCheckResult): Component => {
  if (check.title === 'Internet Connectivity') return IconCloud;
  if (check.title.startsWith('Path Writability')) return IconFolder;
  if (check.title.startsWith('Directory Access')) return IconDatabase;
  if (check.title === 'Docker Compose Binary') return IconRoute;
  if (check.title === 'Podman Binary') return IconHardDrive;
  if (check.title === 'Environment Requirement') return IconMonitorCog;
  if (check.title === 'Podman Machine') return IconMonitorCog;
  if (check.title === 'Podman Engine') return IconHardDrive;
  if (check.title === 'Orchestrator Connection') return IconRoute;
  return IconInfo;
};

const statusIcon = (status: DiagnosticsCheckStatus): Component => {
  const icons: Record<DiagnosticsCheckStatus, Component> = {
    passed: IconCheck,
    warning: IconAlertTriangle,
    failed: IconX,
    skipped: IconCircleDashed,
  };

  return icons[status] ?? IconInfo;
};

const cardClass = (status: DiagnosticsCheckStatus): string => {
  const classes: Record<DiagnosticsCheckStatus, string> = {
    passed: 'border-outline-gray-2',
    warning: 'border-outline-amber-3',
    failed: 'border-outline-red-3',
    skipped: 'border-outline-gray-2 opacity-80',
  };

  return classes[status];
};

const statusIconClass = (status: DiagnosticsCheckStatus): string => {
  const classes: Record<DiagnosticsCheckStatus, string> = {
    passed: 'bg-surface-green-2 text-ink-green-7',
    warning: 'bg-surface-amber-2 text-ink-amber-6',
    failed: 'bg-surface-red-2 text-ink-red-8',
    skipped: 'bg-surface-gray-2 text-ink-gray-5',
  };

  return classes[status];
};

const canFix = (check: DiagnosticsCheckResult): boolean =>
  check.type === 'runtime-health' && check.status === 'failed';
</script>
