<template>
  <section class="import-view">

    <ErrorNotice
      v-if="errorNotice"
      :notice="errorNotice"
      tone="danger"
      @action="onErrorAction"
    />

    <div v-if="successMessage" class="alert alert--success">
      <IconCheckCircle class="alert-icon" />
      {{ successMessage }}
    </div>

    <FirstRunGuide
      v-if="!loading && benches.length === 0"
      title="Import and export need a target bench"
      body="Exports come from existing sites and imports are mapped onto existing benches. Once you create a bench, this screen can validate packages and guide transfers safely."
      :links="importExportSetupLinks"
      compact
    />

    <!-- Wizard form -->
    <div class="form-card">
      <div class="form-card__header">
        <h3 class="form-card__title">Import package</h3>
        <div class="wizard-steps">
          <span class="wizard-step" :class="{ 'wizard-step--active': wizardStep === 1, 'wizard-step--done': wizardStep > 1 }">1. Locate</span>
          <span class="wizard-step" :class="{ 'wizard-step--active': wizardStep === 2, 'wizard-step--done': wizardStep > 2 }">2. Review</span>
          <span class="wizard-step" :class="{ 'wizard-step--active': wizardStep === 3 }">3. Map bench</span>
        </div>
      </div>

      <form class="form-body" @submit.prevent="onValidatePackage">
        <p v-if="wizardErrors.length > 0" class="form-error">{{ wizardErrors.join(' ') }}</p>

        <!-- Step 1: Locate -->
        <div v-if="wizardStep === 1" class="form-grid">
          <label class="form-field form-field--full">
            <span class="form-label">Export artifact directory</span>
            <input v-model="draft.artifactDirectory" type="text" placeholder="/absolute/path/to/site-export-v1" :disabled="validating" />
          </label>
        </div>

        <!-- Step 2: Review -->
        <template v-if="wizardStep === 2 && validation">
          <div class="import-summary">
            <div class="import-summary__row"><span>Site</span><strong>{{ validation.summary.siteName }}</strong></div>
            <div class="import-summary__row"><span>Exported from bench</span><strong>{{ validation.summary.benchName }}</strong></div>
            <div class="import-summary__row"><span>Runtime</span><strong>{{ validation.summary.benchRuntime }}</strong></div>
            <div class="import-summary__row"><span>Frappe</span><strong>{{ validation.summary.benchFrappeVersion }}</strong></div>
            <div class="import-summary__row"><span>Package version</span><strong>v{{ validation.summary.packageVersion }}</strong></div>
            <div class="import-summary__row"><span>Required apps</span><strong>{{ validation.summary.requiredAppIds.join(', ') || 'None' }}</strong></div>
          </div>

          <div class="issues-list">
            <div
              v-for="issue in validation.issues"
              :key="`${issue.code}-${issue.message}`"
              class="issue-item"
              :class="`issue-item--${issue.severity}`"
            >
              {{ issue.message }}
            </div>
            <div v-if="validation.issues.length === 0" class="issue-item issue-item--ok">
              No compatibility issues detected.
            </div>
          </div>
        </template>

        <!-- Step 3: Map bench -->
        <template v-if="wizardStep === 3 && validation">
          <div class="form-grid">
            <label class="form-field form-field--full">
              <span class="form-label">Target bench</span>
              <select v-model="draft.benchId" :disabled="validating || benches.length === 0">
                <option value="">Select a bench…</option>
                <option v-for="bench in benches" :key="bench.id" :value="bench.id">
                  {{ bench.name }} ({{ bench.runtime }}, Frappe {{ bench.frappeVersion }})
                </option>
              </select>
            </label>

            <label class="form-field form-field--full">
              <span class="form-label">Conflict policy</span>
              <select v-model="draft.conflictPolicy" :disabled="executing">
                <option value="block">Block import if the site name already exists</option>
                <option value="rename">Rename imported site when a name conflict exists</option>
              </select>
            </label>
          </div>

          <div class="import-summary">
            <div class="import-summary__row"><span>Conflict preview</span><strong>{{ conflictPreview.message }}</strong></div>
            <div class="import-summary__row"><span>Readiness</span><strong>{{ validation.canImport ? 'Passed compatibility checks' : 'Has blocking issues' }}</strong></div>
            <div class="import-summary__row"><span>Policy</span><strong>{{ draft.conflictPolicy === 'rename' ? 'Rename on conflict' : 'Block on conflict' }}</strong></div>
          </div>

          <div v-if="executionSteps.length > 0" class="issues-list">
            <div
              v-for="(step, index) in executionSteps"
              :key="`${step.name}-${index}`"
              class="issue-item"
              :class="`issue-item--${step.status === 'failed' ? 'error' : step.status}`"
            >
              <strong>{{ step.name }}:</strong> {{ step.message }}
            </div>
          </div>
        </template>

        <div class="form-actions">
          <button v-if="wizardStep > 1" type="button" class="btn btn--subtle" @click="onPreviousStep">Back</button>
          <button v-if="wizardStep === 1" type="submit" class="btn btn--primary" :disabled="validating">
            {{ validating ? 'Validating…' : 'Validate package' }}
          </button>
          <button v-if="wizardStep === 2" type="button" class="btn btn--primary" @click="onNextStep">
            Continue to bench mapping
          </button>
          <button v-if="wizardStep === 3" type="button" class="btn btn--primary" :disabled="executing || !validation" @click="onExecuteImport">
            {{ executing ? 'Importing…' : 'Execute import' }}
          </button>
        </div>
      </form>
    </div>

    <ConfirmationDialog
      :open="importConfirmOpen"
      title="Execute import"
      :message="importConfirmMessage"
      confirm-label="Execute import"
      @cancel="importConfirmOpen = false"
      @confirm="onConfirmExecuteImport"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconCheckCircle from '~icons/lucide/check-circle';
import FirstRunGuide, { type FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import type {
  BenchListItem,
  ImportConflictPolicy,
  ImportExecutionStep,
  ImportValidationResponse,
  SiteListItem,
} from '../../shared/ipc';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import { useIpc } from '../composables/useIpc';
import { buildErrorRemediationNotice } from '../error-remediation';
import {
  buildImportConflictPreview,
  getImportWizardStepErrors,
  type ImportWizardStep,
} from '../import-wizard';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';

const ipc = useIpc();
const benches = ref<BenchListItem[]>([]);
const sites = ref<SiteListItem[]>([]);
const loading = ref(false);
const validating = ref(false);
const executing = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const validation = ref<ImportValidationResponse | null>(null);
const executionSteps = ref<ImportExecutionStep[]>([]);
const wizardStep = ref<ImportWizardStep>(1);

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

watch(() => loading.value, () => {
  setPageHeaderActions([
    {
      id: 'import-export-refresh',
      label: loading.value ? 'Refreshing…' : 'Refresh',
      variant: 'subtle',
      disabled: loading.value,
      icon: IconRotateCcw,
      onClick: () => {
        void refreshContext();
      },
    },
  ]);
}, { immediate: true });

onBeforeUnmount(() => {
  clearPageHeaderActions();
});

const draft = reactive({
  artifactDirectory: '',
  benchId: '',
  conflictPolicy: 'block' as ImportConflictPolicy,
});

const wizardErrors = computed(() => getImportWizardStepErrors(wizardStep.value, draft, validation.value));
const errorNotice = computed(() => (error.value ? buildErrorRemediationNotice('import-export', error.value) : null));
const conflictPreview = computed(() =>
  buildImportConflictPreview(benches.value, sites.value, draft.benchId, validation.value)
);
const importConfirmOpen = ref(false);
const importExportSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Create a bench', to: '/benches' },
  { label: 'Create a site', to: '/sites' },
]);
const importConfirmMessage = computed(() => {
  if (draft.conflictPolicy === 'rename') {
    return 'Rename-on-conflict can create a new site name automatically. Confirm to continue with import execution.';
  }

  return 'Execute the import with current mapping and conflict policy?';
});

const refreshContext = async () => {
  loading.value = true;
  error.value = null;

  try {
    const [benchList, siteList] = await Promise.all([ipc.listBenches(), ipc.listSites()]);
    benches.value = benchList;
    sites.value = siteList;
  } catch (err) {
    error.value = String(err);
  } finally {
    loading.value = false;
  }
};

const onValidatePackage = async () => {
  if (wizardErrors.value.length > 0) {
    return;
  }

  validating.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    validation.value = await ipc.validateImportPackage({
      artifactDirectory: draft.artifactDirectory,
      benchId: draft.benchId || null,
    });
    executionSteps.value = [];
    wizardStep.value = 2;
    successMessage.value = validation.value.canImport
      ? 'Package validated. Review the summary and select a target bench.'
      : 'Package validated with blocking issues. Review the findings before proceeding.';
  } catch (err) {
    error.value = String(err);
    validation.value = null;
  } finally {
    validating.value = false;
  }
};

const onNextStep = () => {
  if (wizardErrors.value.length > 0) {
    return;
  }

  if (wizardStep.value < 3) {
    wizardStep.value = (wizardStep.value + 1) as ImportWizardStep;
  }
};

const onPreviousStep = () => {
  if (wizardStep.value > 1) {
    wizardStep.value = (wizardStep.value - 1) as ImportWizardStep;
  }
};

const onErrorAction = async (actionId: string): Promise<void> => {
  if (actionId === 'retry') {
    await refreshContext();
  }
};

const onExecuteImport = async () => {
  if (wizardErrors.value.length > 0 || !validation.value) {
    return;
  }

  if (draft.conflictPolicy === 'rename' || conflictPreview.value.status === 'warning') {
    importConfirmOpen.value = true;
    return;
  }

  await executeImport();
};

const onConfirmExecuteImport = async (): Promise<void> => {
  importConfirmOpen.value = false;
  await executeImport();
};

const executeImport = async (): Promise<void> => {
  if (wizardErrors.value.length > 0 || !validation.value) {
    return;
  }

  executing.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    const result = await ipc.executeImportPackage({
      artifactDirectory: draft.artifactDirectory,
      benchId: draft.benchId,
      conflictPolicy: draft.conflictPolicy,
    });

    executionSteps.value = result.steps;
    successMessage.value = result.success
      ? `Import completed. Created site ${result.siteName}.`
      : 'Import did not complete. Review execution details.';

    if (result.success) {
      await refreshContext();
    }
  } catch (err) {
    error.value = String(err);
    executionSteps.value = [];
  } finally {
    executing.value = false;
  }
};

watch(
  () => draft.benchId,
  async (nextBenchId, previousBenchId) => {
    if (!validation.value || !nextBenchId || nextBenchId === previousBenchId) {
      return;
    }

    validating.value = true;
    error.value = null;

    try {
      validation.value = await ipc.validateImportPackage({
        artifactDirectory: draft.artifactDirectory,
        benchId: nextBenchId,
      });
      executionSteps.value = [];
    } catch (err) {
      error.value = String(err);
    } finally {
      validating.value = false;
    }
  }
);

onMounted(() => {
  void refreshContext();
});
</script>

<style scoped>
.import-view {
  display: grid;
  gap: 16px;
}


/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
  white-space: nowrap;
}

.btn:hover:not(:disabled) { background: var(--surface-hover); }
.btn--subtle { border-color: var(--border-default); }
.btn--primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn--primary:hover:not(:disabled) { background: var(--primary-hover); }

/* Alert */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.alert--success {
  color: var(--green-text);
  background: var(--green-light);
  border: 1px solid var(--green-border);
}

/* Form card */
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.form-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
}

.form-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-body { padding: 16px; display: grid; gap: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.form-field { display: grid; gap: 4px; }
.form-field--full { grid-column: 1 / -1; }
.form-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.form-error { margin: 0; font-size: 13px; color: var(--red-text); }
.form-actions { display: flex; gap: 8px; }

/* Wizard steps */
.wizard-steps { display: flex; gap: 4px; }

.wizard-step {
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--surface-subtle);
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}

.wizard-step--active {
  background: var(--primary);
  color: var(--primary-text);
  border-color: var(--primary);
}

.wizard-step--done {
  background: var(--green-light);
  color: var(--green-text);
  border-color: var(--green-border);
}

/* Import summary */
.import-summary {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 6px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-light);
}

.import-summary__row {
  display: flex;
  gap: 12px;
  font-size: 13px;
}

.import-summary__row span {
  min-width: 140px;
  color: var(--text-secondary);
}

.import-summary__row strong {
  color: var(--text-primary);
  font-weight: 500;
}

/* Issues list */
.issues-list {
  display: grid;
  gap: 4px;
}

.issue-item {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.issue-item--error {
  color: var(--red-text);
  background: var(--red-light);
}

.issue-item--warning {
  color: var(--orange-text);
  background: var(--orange-light);
}

.issue-item--ok,
.issue-item--success {
  color: var(--green-text);
  background: var(--green-light);
}
</style>