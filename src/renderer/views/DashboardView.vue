<template>
  <div class="dashboard">
    <FirstRunGuide
      v-if="showGettingStarted"
      title="Set up your local workspace"
      body="A fresh install has no benches, sites, or workspaces yet. Start with one bench, then create a site and group it once the runtime is healthy."
      :steps="gettingStartedSteps"
      :links="gettingStartedLinks"
    />

    <section id="overview" class="dashboard-section">
      <!-- Metric strip — Frappe Cloud style -->
      <div class="metric-strip">
        <article
          v-for="metric in overviewMetrics"
          :key="metric.label"
          class="metric-cell"
        >
          <p class="metric-cell__label">{{ metric.label }}</p>
          <div class="metric-cell__row">
            <p class="metric-cell__value" :class="metric.tone ? `metric-cell__value--${metric.tone}` : ''">{{ metric.value }}</p>
            <p v-if="metric.sublabel" class="metric-cell__sublabel">{{ metric.sublabel }}</p>
          </div>
        </article>
      </div>

      <!-- Two-column layout: Site info + Chart -->
      <div class="overview-grid">
        <!-- Site Information panel -->
        <article class="info-panel">
          <h2 class="info-panel__title">Site Information</h2>
          <dl class="info-table">
            <div v-for="item in workspaceInformation" :key="item.label" class="info-table__row">
              <dt>{{ item.label }}</dt>
              <dd>
                <template v-if="item.flag">
                  <span class="info-flag">{{ item.flag }}</span>
                </template>
                {{ item.value }}
              </dd>
            </div>
          </dl>
          <div class="info-panel__footer">
            <button class="tag-btn">Add Tag +</button>
          </div>
        </article>

        <!-- Daily Usage chart panel -->
        <article class="chart-panel">
          <header class="chart-panel__header">
            <h2 class="chart-panel__title">Daily Usage</h2>
            <RouterLink to="/console" class="chart-panel__link">All analytics →</RouterLink>
          </header>

          <div class="chart-area">
            <div class="chart-y-labels">
              <span v-for="tick in chartYTicks" :key="tick">{{ tick }}</span>
            </div>
            <div class="chart-canvas">
              <svg viewBox="0 0 320 140" class="chart-svg" preserveAspectRatio="none" aria-hidden="true">
                <!-- Grid lines -->
                <line v-for="(tick, i) in chartYTicks" :key="`grid-${i}`"
                  x1="0" :y1="getGridY(i)" x2="320" :y2="getGridY(i)"
                  class="chart-grid" />
                <!-- Area -->
                <path :d="activityAreaPath" class="chart__area" />
                <!-- Line -->
                <path :d="activityLinePath" class="chart__line" />
                <!-- Points -->
                <circle
                  v-for="point in activityChartPoints"
                  :key="point.label"
                  :cx="point.x"
                  :cy="point.y"
                  r="3"
                  class="chart__point"
                />
              </svg>
            </div>
          </div>
          <div class="chart-x-labels">
            <span v-for="point in activityChartPoints" :key="`${point.label}-label`">{{ point.label }}</span>
          </div>
        </article>
      </div>
    </section>

    <section id="runtime" class="dashboard-section">
      <h2 class="section-heading">Runtime Diagnostics</h2>
      <p class="section-desc">Inspect runtime dependencies, fallback behavior, and guided repair actions.</p>
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
      <h2 class="section-heading">Activity</h2>
      <p class="section-desc">Recent tasks and long-running operations across benches, sites, runtime, and imports.</p>
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
      <h2 class="section-heading">Quick Actions</h2>
      <p class="section-desc">Jump directly into the core operational areas from the overview surface.</p>
      <div class="shortcut-grid">
        <RouterLink to="/benches" class="shortcut-card">
          <div class="shortcut-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 7v10h14V7" /><path d="M4 7h16" />
            </svg>
          </div>
          <div>
            <p class="shortcut-card__title">Manage Benches</p>
            <p class="shortcut-card__desc">Create and control bench environments</p>
          </div>
        </RouterLink>
        <RouterLink to="/sites" class="shortcut-card">
          <div class="shortcut-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="11" r="7" /><path d="M5 11h14" />
            </svg>
          </div>
          <div>
            <p class="shortcut-card__title">Manage Sites</p>
            <p class="shortcut-card__desc">View and control local sites</p>
          </div>
        </RouterLink>
        <RouterLink to="/settings" class="shortcut-card">
          <div class="shortcut-card__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <div>
            <p class="shortcut-card__title">Configure Settings</p>
            <p class="shortcut-card__desc">Set runtime defaults and preferences</p>
          </div>
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
    label: 'Current Plan',
    value: 'Local Dev',
    sublabel: 'Desktop runtime',
    tone: null,
  },
  {
    label: 'Compute',
    value: `${setupSummary.benches} benches`,
    sublabel: `${setupSummary.sites} sites active`,
    tone: null,
  },
  {
    label: 'Storage',
    value: `${setupSummary.workspaces} workspaces`,
    sublabel: 'Project groupings',
    tone: null,
  },
  {
    label: 'Runtime',
    value: runtimeStatusLabel.value,
    sublabel: runtimeHealth.value
      ? `${runtimeHealth.value.selectedRuntime}${runtimeHealth.value.fallbackApplied ? ' (fallback)' : ''}`
      : 'Diagnostics pending',
    tone: runtimeStatusTone.value,
  },
]);

const workspaceInformation = computed(() => [
  { label: 'Owned by', value: settingsForm.value.editorPreference || 'local@frappe.cafe', flag: null },
  { label: 'Created by', value: settingsForm.value.runtimePreference || 'Administrator', flag: null },
  { label: 'Runtime', value: settingsForm.value.runtimePreference || 'docker', flag: null },
  { label: 'Region', value: 'Local Machine', flag: '🖥️' },
  { label: 'Storage Path', value: settingsForm.value.storagePath || '~/Library/Application Support/Frappe Cafe', flag: null },
  { label: 'Frappe Version', value: settingsForm.value.defaultFrappeVersion || '15.0.0', flag: null },
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

const chartYTicks = computed(() => {
  const maxCount = Math.max(...activitySeries.value.map((item) => item.count), 1);
  const step = Math.ceil(maxCount / 3);
  return [step * 3, step * 2, step, 0].map(String);
});

const getGridY = (index: number): number => {
  return 10 + (index * 120) / 3;
};

const activityChartPoints = computed(() => {
  const maxCount = Math.max(...activitySeries.value.map((item) => item.count), 1);

  return activitySeries.value.map((item, index) => {
    const x = 10 + (index * 300) / Math.max(activitySeries.value.length - 1, 1);
    const y = 130 - (item.count / maxCount) * 110;

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
    return 'M10 130L310 130';
  }

  const firstPoint = activityChartPoints.value[0];
  const lastPoint = activityChartPoints.value[activityChartPoints.value.length - 1];
  const line = activityLinePath.value.replace(/^M/, 'L');

  return `M${firstPoint.x} 130 ${line} L${lastPoint.x} 130 Z`;
});
</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 24px;
}

.dashboard-section {
  display: grid;
  gap: 16px;
}

.section-heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-desc {
  margin: -8px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ============================================================
   Metric Strip — Frappe Cloud "Current Plan / Compute / Storage / Database" bar
   ============================================================ */

.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.metric-cell {
  padding: 16px 20px;
  border-right: 1px solid var(--border-light);
}

.metric-cell:last-child {
  border-right: 0;
}

.metric-cell__label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.metric-cell__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.metric-cell__value {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.metric-cell__value--ok {
  color: var(--green-text);
}

.metric-cell__value--warning {
  color: var(--red-text);
}

.metric-cell__sublabel {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

/* ============================================================
   Overview Grid — Side by side info + chart
   ============================================================ */

.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Info panel — Frappe Cloud "Site Information" */
.info-panel {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.info-panel__title {
  margin: 0;
  padding: 16px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
}

.info-table {
  margin: 0;
}

.info-table__row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-light);
  align-items: center;
}

.info-table__row:last-child {
  border-bottom: 0;
}

.info-table__row dt {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.info-table__row dd {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  word-break: break-word;
}

.info-flag {
  font-size: 14px;
}

.info-panel__footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-light);
}

.tag-btn {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px dashed var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.tag-btn:hover {
  background: var(--surface-hover);
  border-style: solid;
}

/* ============================================================
   Chart panel — Frappe Cloud "Daily Usage"
   ============================================================ */

.chart-panel {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chart-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}

.chart-panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.chart-panel__link {
  font-size: 12px;
  color: var(--text-secondary);
  text-decoration: none;
}

.chart-panel__link:hover {
  color: var(--text-primary);
}

.chart-area {
  display: flex;
  gap: 8px;
  padding: 20px 20px 8px;
  flex: 1;
}

.chart-y-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  min-width: 20px;
  text-align: right;
  padding: 4px 0;
}

.chart-canvas {
  flex: 1;
}

.chart-svg {
  width: 100%;
  height: 100%;
  min-height: 120px;
  overflow: visible;
}

.chart-grid {
  stroke: var(--border-light);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.chart__area {
  fill: rgba(147, 51, 234, 0.08);
  stroke: none;
}

.chart__line {
  fill: none;
  stroke: #8b5cf6;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chart__point {
  fill: #ffffff;
  stroke: #8b5cf6;
  stroke-width: 2;
}

.chart-x-labels {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 0 20px 16px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  margin-left: 28px;
}

/* ============================================================
   Shortcut Grid
   ============================================================ */

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.shortcut-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  text-decoration: none;
  color: inherit;
  transition: background-color 100ms ease, border-color 100ms ease;
}

.shortcut-card:hover {
  background: var(--surface-hover);
  border-color: var(--border-default);
}

.shortcut-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.shortcut-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.shortcut-card__desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ============================================================
   Responsive
   ============================================================ */

@media (max-width: 1080px) {
  .metric-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-cell:nth-child(2n) {
    border-right: 0;
  }

  .metric-cell:nth-child(n + 3) {
    border-top: 1px solid var(--border-light);
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .shortcut-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .metric-strip {
    grid-template-columns: 1fr;
  }

  .metric-cell {
    border-right: 0;
    border-bottom: 1px solid var(--border-light);
  }

  .metric-cell:last-child {
    border-bottom: 0;
  }
}
</style>