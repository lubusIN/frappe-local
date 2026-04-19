<template>
  <div class="dashboard">
    <FirstRunGuide
      v-if="showGettingStarted"
      title="Set up your local workspace"
      body="A fresh install has no benches, sites, or workspaces yet. Start with one bench, then create a site and group it once the runtime is healthy."
      :steps="gettingStartedSteps"
      :links="gettingStartedLinks"
    />

    <section id="overview" class="dashboard-section dashboard-section--overview">
      <div class="metric-strip">
        <article
          v-for="metric in overviewMetrics"
          :key="metric.label"
          class="metric-card"
          :class="metric.tone ? `metric-card--${metric.tone}` : ''"
        >
          <p class="metric-card__label">{{ metric.label }}</p>
          <p class="metric-card__value">{{ metric.value }}</p>
          <p class="metric-card__detail">{{ metric.detail }}</p>
        </article>
      </div>

      <div class="overview-grid">
        <article class="overview-panel">
          <header class="overview-panel__header">
            <div>
              <h2 class="overview-panel__title">Workspace Information</h2>
              <p class="overview-panel__body">Default runtime and storage settings used by the desktop workspace.</p>
            </div>
            <span class="overview-panel__tag">{{ settingsLoading ? 'Loading' : 'Configured' }}</span>
          </header>

          <dl class="overview-table">
            <div v-for="item in workspaceInformation" :key="item.label" class="overview-table__row">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </article>

        <article class="overview-panel overview-panel--chart">
          <header class="overview-panel__header">
            <div>
              <h2 class="overview-panel__title">Daily Activity</h2>
              <p class="overview-panel__body">Recent task events across benches, sites, runtime, and import flows.</p>
            </div>
            <span class="overview-panel__tag" :class="`overview-panel__tag--${runtimeStatusTone}`">
              {{ runtimeStatusLabel }}
            </span>
          </header>

          <div class="activity-card">
            <div class="activity-card__meta">
              <div>
                <p class="activity-card__metric-label">Recent events</p>
                <p class="activity-card__metric-value">{{ activityTotal }}</p>
              </div>
              <RouterLink to="/console" class="overview-action">Open Console</RouterLink>
            </div>

            <div class="activity-chart">
              <svg viewBox="0 0 320 168" class="activity-chart__svg" aria-hidden="true">
                <path d="M20 136H300" class="activity-chart__axis" />
                <path d="M20 96H300" class="activity-chart__grid" />
                <path d="M20 56H300" class="activity-chart__grid" />
                <path :d="activityAreaPath" class="activity-chart__area" />
                <path :d="activityLinePath" class="activity-chart__line" />
                <circle
                  v-for="point in activityChartPoints"
                  :key="point.label"
                  :cx="point.x"
                  :cy="point.y"
                  r="3.5"
                  class="activity-chart__point"
                />
              </svg>
              <div class="activity-chart__labels">
                <span v-for="point in activityChartPoints" :key="`${point.label}-label`">{{ point.label }}</span>
              </div>
            </div>

            <dl class="activity-summary">
              <div v-for="item in operationalSummary" :key="item.label" class="activity-summary__item">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </div>
        </article>
      </div>
    </section>

    <section id="runtime" class="dashboard-section">
      <div class="section-heading">
        <div>
          <h2 class="section-title">Runtime Diagnostics</h2>
          <p class="section-copy">Inspect runtime dependencies, fallback behavior, and guided repair actions.</p>
        </div>
      </div>
      <RuntimeHealthPanel
        :health="runtimeHealth"
        :loading="runtimeLoading"
        :repairing="runtimeRepairing"
        :error="runtimeError"
        :active-task-status="runtimeTaskStatus"
        :last-task-message="runtimeTaskMessage"
        :repair-logs="runtimeLogs"
        @refresh="refreshRuntimeHealth"
        @repair="onRequestRuntimeRepair"
      />
    </section>

    <section id="activity" class="dashboard-section">
      <div class="section-heading">
        <div>
          <h2 class="section-title">Activity</h2>
          <p class="section-copy">Recent tasks and long-running operations across benches, sites, runtime, and imports.</p>
        </div>
      </div>
      <TaskProgressCenter
        :items="filteredTasks"
        :loading="progressLoading"
        :error="progressError"
        :statusFilter="progressStatusFilter"
        :resourceFilter="progressResourceFilter"
        :recentOnly="progressRecentOnly"
        @update:statusFilter="(value) => (progressStatusFilter.value = value)"
        @update:resourceFilter="(value) => (progressResourceFilter.value = value)"
        @update:recentOnly="(value) => (progressRecentOnly.value = value)"
        @retrySubscription="retryProgressSubscription"
      />
    </section>

    <section id="shortcuts" class="dashboard-section">
      <div class="section-heading">
        <div>
          <h2 class="section-title">Quick Actions</h2>
          <p class="section-copy">Jump directly into the core operational areas from the overview surface.</p>
        </div>
      </div>
      <div class="shortcut-grid">
        <RouterLink to="/benches" class="action-card">
          <p class="card-eyebrow">Benches</p>
          <p class="card-label">Manage environments</p>
        </RouterLink>
        <RouterLink to="/sites" class="action-card">
          <p class="card-eyebrow">Sites</p>
          <p class="card-label">Manage local sites</p>
        </RouterLink>
        <RouterLink to="/settings" class="action-card">
          <p class="card-eyebrow">Settings</p>
          <p class="card-label">Configure preferences</p>
        </RouterLink>
      </div>
    </section>

    <ConfirmationDialog
      :open="runtimeConfirmOpen"
      title="Run runtime repair"
      message="This can modify local runtime dependencies and may take several minutes. Continue?"
      confirm-label="Run repair"
      @cancel="runtimeConfirmOpen = false"
      @confirm="onConfirmRuntimeRepair"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import FirstRunGuide, { type FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import RuntimeHealthPanel from '../components/RuntimeHealthPanel.vue';
import TaskProgressCenter from '../components/TaskProgressCenter.vue';
import { useAppHealth } from '../composables/useAppHealth';
import { useIpc } from '../composables/useIpc';
import { useProgressCenter } from '../composables/useProgressCenter';
import { useRuntimeHealth } from '../composables/useRuntimeHealth';
import { useSettings } from '../composables/useSettings';

const { health, loading, error } = useAppHealth();
const { form: settingsForm, loading: settingsLoading } = useSettings();
const {
  health: runtimeHealth,
  loading: runtimeLoading,
  repairing: runtimeRepairing,
  error: runtimeError,
  activeTaskStatus: runtimeTaskStatus,
  lastTaskMessage: runtimeTaskMessage,
  repairLogs: runtimeLogs,
  refresh: refreshRuntimeHealth,
  repair: repairRuntime,
} = useRuntimeHealth();

const {
  filteredTasks,
  loading: progressLoading,
  error: progressError,
  statusFilter,
  resourceFilter,
  recentOnly,
  reconnect,
} = useProgressCenter();

const progressStatusFilter = computed({
  get: () => statusFilter.value,
  set: (value: 'all' | 'queued' | 'running' | 'success' | 'failure') => {
    statusFilter.value = value;
  },
});

const progressResourceFilter = computed({
  get: () => resourceFilter.value,
  set: (value: 'all' | 'bench' | 'site' | 'import' | 'runtime' | 'system') => {
    resourceFilter.value = value;
  },
});

const progressRecentOnly = computed({
  get: () => recentOnly.value,
  set: (value: boolean) => {
    recentOnly.value = value;
  },
});

const retryProgressSubscription = async (): Promise<void> => {
  await reconnect();
};

const ipc = useIpc();
const setupSummary = reactive({ benches: 0, sites: 0, workspaces: 0 });

const refreshSetupSummary = async (): Promise<void> => {
  try {
    const [benches, sites, workspaces] = await Promise.all([
      ipc.listBenches(),
      ipc.listSites(),
      ipc.listWorkspaces(),
    ]);

    setupSummary.benches = benches.length;
    setupSummary.sites = sites.length;
    setupSummary.workspaces = workspaces.length;
  } catch {
    setupSummary.benches = 0;
    setupSummary.sites = 0;
    setupSummary.workspaces = 0;
  }
};

onMounted(() => {
  void refreshSetupSummary();
});

const showGettingStarted = computed(() =>
  setupSummary.benches === 0 || setupSummary.sites === 0 || setupSummary.workspaces === 0
);

const gettingStartedSteps = computed(() => {
  const steps: string[] = [];

  if (setupSummary.benches === 0) {
    steps.push('Create your first bench from the Benches screen and point it at the local path you want Frappe Cafe to manage.');
  }

  if (setupSummary.benches > 0 && setupSummary.sites === 0) {
    steps.push('Create a site on a running bench so lifecycle, export, and workspace features have real data to operate on.');
  }

  if (setupSummary.sites > 0 && setupSummary.workspaces === 0) {
    steps.push('Create a workspace to group related sites by client, project, or environment.');
  }

  steps.push('Use Settings to confirm runtime health and rerun diagnostics before relying on the app for day-to-day work.');

  return steps;
});

const gettingStartedLinks = computed<FirstRunGuideLink[]>(() => {
  const links: FirstRunGuideLink[] = [];

  if (setupSummary.benches === 0) {
    links.push({ label: 'Create a bench', to: '/benches' });
  }

  if (setupSummary.benches > 0 && setupSummary.sites === 0) {
    links.push({ label: 'Create a site', to: '/sites' });
  }

  if (setupSummary.sites > 0 && setupSummary.workspaces === 0) {
    links.push({ label: 'Create a workspace', to: '/workspaces' });
  }

  links.push({ label: 'Check settings', to: '/settings' });

  return links;
});

const runtimeConfirmOpen = ref(false);

const onRequestRuntimeRepair = (): void => {
  runtimeConfirmOpen.value = true;
};

const onConfirmRuntimeRepair = async (): Promise<void> => {
  runtimeConfirmOpen.value = false;
  await repairRuntime();
};

const runtimeStatusLabel = computed(() => {
  if (runtimeLoading.value) {
    return 'Checking';
  }

  if (runtimeError.value) {
    return 'Unavailable';
  }

  if (runtimeHealth.value?.hasBlockingIssues) {
    return 'Needs Attention';
  }

  if (runtimeHealth.value) {
    return 'Healthy';
  }

  return 'Pending';
});

const runtimeStatusTone = computed(() => {
  if (runtimeLoading.value) {
    return 'muted';
  }

  if (runtimeError.value || runtimeHealth.value?.hasBlockingIssues) {
    return 'warning';
  }

  if (runtimeHealth.value) {
    return 'ok';
  }

  return 'muted';
});

const overviewMetrics = computed(() => [
  {
    label: 'Benches',
    value: String(setupSummary.benches),
    detail: 'Local environments ready for lifecycle actions.',
    tone: null,
  },
  {
    label: 'Sites',
    value: String(setupSummary.sites),
    detail: 'Sites attached to benches and available for operations.',
    tone: null,
  },
  {
    label: 'Workspaces',
    value: String(setupSummary.workspaces),
    detail: 'Project groupings used to keep navigation manageable.',
    tone: null,
  },
  {
    label: 'Runtime',
    value: runtimeStatusLabel.value,
    detail: runtimeHealth.value
      ? `${runtimeHealth.value.selectedRuntime} selected${runtimeHealth.value.fallbackApplied ? ' via fallback' : ''}.`
      : 'Runtime diagnostics have not returned a result yet.',
    tone: runtimeStatusTone.value,
  },
]);

const workspaceInformation = computed(() => [
  { label: 'Storage Path', value: settingsForm.value.storagePath },
  { label: 'Preferred Runtime', value: settingsForm.value.runtimePreference },
  { label: 'Default Frappe', value: settingsForm.value.defaultFrappeVersion },
  { label: 'Terminal', value: settingsForm.value.terminalPreference },
  { label: 'Editor', value: settingsForm.value.editorPreference },
  {
    label: 'Updates',
    value: `${settingsForm.value.updateChannel}${settingsForm.value.autoUpdateEnabled ? ' / auto enabled' : ' / manual'}`,
  },
]);

const operationalSummary = computed(() => [
  {
    label: 'Desktop Services',
    value: error.value ? 'Unavailable' : 'Connected',
  },
  {
    label: 'App Health',
    value: loading.value ? 'Checking' : error.value ? 'Unavailable' : health.value?.appName ?? 'Pending',
  },
  {
    label: 'Runtime Selection',
    value: runtimeHealth.value
      ? `${runtimeHealth.value.selectedRuntime}${runtimeHealth.value.fallbackApplied ? ' (fallback applied)' : ''}`
      : 'Waiting for diagnostics',
  },
  {
    label: 'Blocking Issues',
    value: runtimeHealth.value ? String(runtimeHealth.value.blockingDependencies.length) : '0',
  },
  {
    label: 'Environment Counts',
    value: `${setupSummary.benches} benches / ${setupSummary.sites} sites / ${setupSummary.workspaces} workspaces`,
  },
]);

const activitySeries = computed(() => {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const counts = new Map<string, number>();

  for (const task of filteredTasks.value) {
    const date = new Date(task.timestamp);
    const label = labels[date.getDay() === 0 ? 6 : date.getDay() - 1];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const label = labels[day.getDay() === 0 ? 6 : day.getDay() - 1];
    return {
      label,
      count: counts.get(label) ?? 0,
    };
  });
});

const activityTotal = computed(() => activitySeries.value.reduce((sum, item) => sum + item.count, 0));

const activityChartPoints = computed(() => {
  const maxCount = Math.max(...activitySeries.value.map((item) => item.count), 1);

  return activitySeries.value.map((item, index) => {
    const x = 20 + (index * 280) / Math.max(activitySeries.value.length - 1, 1);
    const y = 136 - (item.count / maxCount) * 92;

    return {
      ...item,
      x,
      y,
    };
  });
});

const activityLinePath = computed(() =>
  activityChartPoints.value
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ')
);

const activityAreaPath = computed(() => {
  if (activityChartPoints.value.length === 0) {
    return 'M20 136L300 136';
  }

  const firstPoint = activityChartPoints.value[0];
  const lastPoint = activityChartPoints.value[activityChartPoints.value.length - 1];
  const line = activityLinePath.value.replace(/^M/, 'L');

  return `M${firstPoint.x} 136 ${line} L${lastPoint.x} 136 Z`;
});
</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 24px;
}

.dashboard-section {
  display: grid;
  gap: 14px;
}

.dashboard-section--overview {
  gap: 16px;
}

.section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f272e;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.section-copy {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: #687381;
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid #e4e9ef;
  border-radius: 16px;
  background: #ffffff;
  overflow: hidden;
}

.metric-card {
  display: grid;
  gap: 8px;
  min-height: 132px;
  padding: 18px 20px;
  border-right: 1px solid #e4e9ef;
}

.metric-card:last-child {
  border-right: 0;
}

.metric-card__label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.metric-card__value {
  margin: 0;
  font-size: 30px;
  line-height: 1.05;
  color: #1f272e;
}

.metric-card__detail {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #687381;
}

.metric-card--ok .metric-card__value {
  color: #166534;
}

.metric-card--warning .metric-card__value {
  color: #9b2c2c;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  gap: 16px;
}

.overview-panel {
  border: 1px solid #e4e9ef;
  border-radius: 16px;
  background: #ffffff;
  overflow: hidden;
}

.overview-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #e4e9ef;
}

.overview-panel__title {
  margin: 0;
  font-size: 18px;
  color: #1f272e;
}

.overview-panel__body {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #687381;
}

.overview-panel__tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid #e4e9ef;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.overview-panel__tag--ok {
  color: #166534;
  background: #ecfdf3;
  border-color: #bbf7d0;
}

.overview-panel__tag--warning {
  color: #9b2c2c;
  background: #fff5f5;
  border-color: #fecaca;
}

.overview-table {
  margin: 0;
}

.overview-table__row {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
  gap: 12px;
  padding: 14px 20px;
  border-top: 1px solid #edf2f7;
}

.overview-table__row:first-child {
  border-top: 0;
}

.overview-table__row dt,
.overview-table__row dd {
  margin: 0;
}

.overview-table__row dt {
  color: #687381;
  font-size: 13px;
}

.overview-table__row dd {
  color: #1f272e;
  font-size: 14px;
  word-break: break-word;
}

.overview-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 20px 20px;
  border-top: 1px solid #edf2f7;
}

.overview-action {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #d7dee8;
  background: #ffffff;
  color: #334155;
  text-decoration: none;
}

.overview-action:hover {
  background: #f8fafc;
  border-color: #cfd9e6;
}

.overview-panel--chart {
  background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
}

.activity-card {
  display: grid;
  gap: 18px;
  padding: 18px 20px 20px;
}

.activity-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.activity-card__metric-label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.activity-card__metric-value {
  margin: 6px 0 0;
  font-size: 30px;
  line-height: 1.05;
  color: #1f272e;
}

.activity-chart {
  display: grid;
  gap: 8px;
}

.activity-chart__svg {
  width: 100%;
  height: auto;
  overflow: visible;
}

.activity-chart__axis,
.activity-chart__grid {
  fill: none;
  stroke-width: 1;
}

.activity-chart__axis {
  stroke: #cfd9e6;
}

.activity-chart__grid {
  stroke: #e8edf3;
}

.activity-chart__area {
  fill: rgba(147, 51, 234, 0.12);
  stroke: none;
}

.activity-chart__line {
  fill: none;
  stroke: #8b5cf6;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.activity-chart__point {
  fill: #ffffff;
  stroke: #8b5cf6;
  stroke-width: 2;
}

.activity-chart__labels {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}

.activity-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.activity-summary__item {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #edf2f7;
  border-radius: 14px;
  background: #f9fbfd;
}

.activity-summary__item dt,
.activity-summary__item dd {
  margin: 0;
}

.activity-summary__item dt {
  font-size: 12px;
  color: #64748b;
}

.activity-summary__item dd {
  font-size: 14px;
  color: #1f272e;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.card-eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}

.card-label {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #64748b;
}

.action-card {
  display: grid;
  align-content: start;
  gap: 6px;
  min-height: 116px;
  padding: 18px;
  border: 1px solid #e4e9ef;
  border-radius: 16px;
  background: #ffffff;
  text-decoration: none;
  color: inherit;
  transition: background-color 120ms ease, border-color 120ms ease;
}

.action-card:hover {
  background: #f8fafc;
  border-color: #d7dee8;
}

@media (max-width: 1080px) {
  .metric-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-card:nth-child(2n) {
    border-right: 0;
  }

  .metric-card:nth-child(n + 3) {
    border-top: 1px solid #e4e9ef;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .section-heading,
  .overview-panel__header {
    flex-direction: column;
  }

  .metric-strip {
    grid-template-columns: 1fr;
  }

  .metric-card {
    border-right: 0;
    border-top: 1px solid #e4e9ef;
  }

  .metric-card:first-child {
    border-top: 0;
  }

  .overview-table__row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>