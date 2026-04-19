<template>
  <section class="import-export-view">
    <header class="import-export-header">
      <div>
        <p class="card-eyebrow">Import / Export</p>
        <h3 class="import-export-title">Import package review</h3>
      </div>
      <button
        type="button"
        class="import-export-refresh"
        :disabled="loading"
        @click="refreshContext"
      >
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <ErrorNotice
      v-if="errorNotice"
      :notice="errorNotice"
      tone="danger"
      @action="onErrorAction"
    />
    <p v-if="successMessage" class="import-export-success">{{ successMessage }}</p>

    <FirstRunGuide
      v-if="!loading && benches.length === 0"
      title="Import and export need a target bench"
      body="Exports come from existing sites and imports are mapped onto existing benches. Once you create a bench, this screen can validate packages and guide transfers safely."
      :steps="importExportSetupSteps"
      :links="importExportSetupLinks"
      compact
    />

    <form class="import-export-form" @submit.prevent="onValidatePackage">
      <div class="import-export-steps import-export-field--full">
        <p class="import-export-step" :class="{ 'import-export-step--active': wizardStep === 1 }">1. Locate package</p>
        <p class="import-export-step" :class="{ 'import-export-step--active': wizardStep === 2 }">2. Review validation</p>
        <p class="import-export-step" :class="{ 'import-export-step--active': wizardStep === 3 }">3. Map bench</p>
      </div>

      <p v-if="wizardErrors.length > 0" class="import-export-error import-export-field--full">
        {{ wizardErrors.join(' ') }}
      </p>

      <template v-if="wizardStep === 1">
        <label class="import-export-field import-export-field--full">
          <span>Export artifact directory</span>
          <input
            v-model="draft.artifactDirectory"
            type="text"
            placeholder="/absolute/path/to/site-export-v1"
            :disabled="validating"
          />
        </label>
      </template>

      <template v-if="wizardStep === 2 && validation">
        <div class="import-export-summary import-export-field--full">
          <p><strong>Site:</strong> {{ validation.summary.siteName }}</p>
          <p><strong>Exported from bench:</strong> {{ validation.summary.benchName }}</p>
          <p><strong>Runtime:</strong> {{ validation.summary.benchRuntime }}</p>
          <p><strong>Frappe:</strong> {{ validation.summary.benchFrappeVersion }}</p>
          <p><strong>Package version:</strong> v{{ validation.summary.packageVersion }}</p>
          <p><strong>Required apps:</strong> {{ validation.summary.requiredAppIds.join(', ') || 'None' }}</p>
        </div>

        <ul class="import-export-issues import-export-field--full">
          <li
            v-for="issue in validation.issues"
            :key="`${issue.code}-${issue.message}`"
            class="import-export-issue"
            :class="`import-export-issue--${issue.severity}`"
          >
            {{ issue.message }}
          </li>
          <li v-if="validation.issues.length === 0" class="import-export-issue import-export-issue--ok">
            No compatibility issues detected.
          </li>
        </ul>
      </template>

      <template v-if="wizardStep === 3 && validation">
        <label class="import-export-field import-export-field--full">
          <span>Target bench</span>
          <select v-model="draft.benchId" :disabled="validating || benches.length === 0">
            <option value="">Select a bench</option>
            <option v-for="bench in benches" :key="bench.id" :value="bench.id">
              {{ bench.name }} ({{ bench.runtime }}, Frappe {{ bench.frappeVersion }})
            </option>
          </select>
        </label>

        <label class="import-export-field import-export-field--full">
          <span>Conflict policy</span>
          <select v-model="draft.conflictPolicy" :disabled="executing">
            <option value="block">Block import if the site name already exists</option>
            <option value="rename">Rename imported site when a name conflict exists</option>
          </select>
        </label>

        <div class="import-export-summary import-export-field--full">
          <p><strong>Conflict preview:</strong> {{ conflictPreview.message }}</p>
          <p><strong>Readiness:</strong> {{ validation.canImport ? 'Package passed compatibility checks.' : 'Package has blocking issues.' }}</p>
          <p><strong>Policy:</strong> {{ draft.conflictPolicy === 'rename' ? 'Rename on conflict' : 'Block on conflict' }}</p>
        </div>

        <ul v-if="executionSteps.length > 0" class="import-export-issues import-export-field--full">
          <li
            v-for="(step, index) in executionSteps"
            :key="`${step.name}-${index}`"
            class="import-export-issue"
            :class="`import-export-issue--${step.status === 'failed' ? 'error' : step.status}`"
          >
            <strong>{{ step.name }}:</strong> {{ step.message }}
          </li>
        </ul>
      </template>

      <div class="import-export-actions import-export-field--full">
        <button v-if="wizardStep > 1" type="button" class="import-export-button" @click="onPreviousStep">
          Back
        </button>
        <button
          v-if="wizardStep === 1"
          type="submit"
          class="import-export-button"
          :disabled="validating"
        >
          {{ validating ? 'Validating…' : 'Validate package' }}
        </button>
        <button
          v-if="wizardStep === 2"
          type="button"
          class="import-export-button"
          @click="onNextStep"
        >
          Continue to bench mapping
        </button>
        <button
          v-if="wizardStep === 3"
          type="button"
          class="import-export-button"
          :disabled="executing || !validation"
          @click="onExecuteImport"
        >
          {{ executing ? 'Importing…' : 'Execute import' }}
        </button>
      </div>
    </form>

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
import { computed, onMounted, reactive, ref, watch } from 'vue';
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
const importExportSetupSteps = computed(() => [
  'Create a bench so imports have a destination and exports have a matching environment.',
  'Create at least one site if you want to test export packaging from inside the app.',
  'Return here to validate an artifact directory and map it safely to a bench.',
]);
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
.import-export-view {
  display: grid;
  gap: 16px;
}

.import-export-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.import-export-form {
  display: grid;
  gap: 16px;
  padding: 20px;
  border-radius: 18px;
  border: 1px solid rgba(31, 28, 24, 0.12);
  background: rgba(255, 251, 245, 0.82);
}

.import-export-steps,
.import-export-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.import-export-step {
  margin: 0;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(113, 78, 40, 0.08);
  color: rgba(31, 28, 24, 0.7);
}

.import-export-step--active {
  background: rgba(113, 78, 40, 0.18);
  color: #6e4a29;
}

.import-export-field {
  display: grid;
  gap: 6px;
}

.import-export-field--full {
  width: 100%;
}

.import-export-field input,
.import-export-field select {
  border: 1px solid rgba(31, 28, 24, 0.16);
  border-radius: 10px;
  background: #fffdf8;
  color: inherit;
  padding: 10px 12px;
}

.import-export-button,
.import-export-refresh {
  border: 1px solid rgba(113, 78, 40, 0.18);
  background: rgba(113, 78, 40, 0.12);
  color: #4c331f;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
}

.import-export-button:disabled,
.import-export-refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.import-export-summary {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(113, 78, 40, 0.06);
}

.import-export-summary p,
.import-export-issue {
  margin: 0;
}

.import-export-issues {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.import-export-issue {
  padding: 12px 14px;
  border-radius: 12px;
}

.import-export-issue--error,
.import-export-error {
  color: #8a2f2f;
  background: rgba(196, 94, 94, 0.12);
}

.import-export-issue--warning {
  color: #7a5a1a;
  background: rgba(210, 169, 76, 0.16);
}

.import-export-issue--ok,
.import-export-success {
  color: #2f6a43;
  background: rgba(83, 153, 113, 0.12);
}
</style>