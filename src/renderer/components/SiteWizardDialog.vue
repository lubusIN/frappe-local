<template>
  <Dialog
    :model-value="open"
    :options="{ title: 'New site', size: '3xl' }"
    @update:model-value="$emit('update:open', $event)"
    @close="onCloseSiteWizard"
  >
    <template #body-content>
      <div class="site-wizard-dialog">
        <div class="wizard-header">
          <span :class="['wizard-header__item', wizardStep === 1 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
            Bench
          </span>
          <IconChevronRight class="wizard-header__icon" />
          <span :class="['wizard-header__item', wizardStep === 2 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
            Details
          </span>
          <IconChevronRight class="wizard-header__icon" />
          <span :class="['wizard-header__item', wizardStep === 3 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
            Apps
          </span>
          <IconChevronRight class="wizard-header__icon" />
          <span :class="['wizard-header__item', wizardStep === 4 ? 'wizard-header__item--active' : 'wizard-header__item--inactive']">
            Confirm
          </span>
        </div>

        <form
          class="form-body"
          @submit.prevent="onCreateSite"
        >
          <p
            v-if="wizardErrors.length > 0"
            class="mb-4 text-sm text-ink-red-3"
          >
            {{ wizardErrors.join(' ') }}
          </p>

          <div
            v-if="wizardStep === 1"
            class="form-grid"
          >
            <label class="form-field">
              <span class="mb-1 text-xs font-medium text-ink-gray-6">Select bench</span>
              <Select
                v-model="createBenchSelection"
                :disabled="benchLoading"
                :options="createBenchOptions"
                variant="outline"
              />
            </label>
          </div>

          <div
            v-if="wizardStep === 2"
            class="form-grid"
          >
            <label class="form-field">
              <FormLabel label="Site name" />
              <TextInput
                v-model="createForm.name"
                type="text"
                required
                placeholder="my-site"
                variant="outline"
              >
                <template #suffix>
                  <span class="text-p-sm text-ink-gray-6">.localhost</span>
                </template>
              </TextInput>
            </label>
            <div class="flex items-center gap-2">
              <Switch
                v-model="createForm.force"
                label="Force create"
              />
            </div>
          </div>

          <div
            v-if="wizardStep === 3"
            class="form-grid"
          >
            <label class="form-field">
              <FormLabel label="Apps" />
              <AppPicker
                v-model="createForm.appsSelected"
                class="form-field__control"
                :disabled="creating || loading"
                :frappe-version="selectedBench?.frappeVersion"
                :allowed-app-ids="selectedBenchAppIds"
                :disabled-app-ids="defaultInstalledSiteApps"
              />
            </label>
          </div>

          <div
            v-if="wizardStep === 4"
            class="p-4 rounded wizard-summary bg-surface-gray-2"
          >
            <div class="flex justify-between mb-2">
              <span>Bench</span><strong>{{ selectedBench?.name ?? createForm.benchId }}</strong>
            </div>
            <div class="flex justify-between mb-2">
              <span>Site</span><strong>{{ toSiteDomain(createForm.name) }}</strong>
            </div>
            <div
              v-if="createForm.force"
              class="flex justify-between mb-2"
            >
              <span>Force</span><strong>Yes</strong>
            </div>
            <div class="flex justify-between">
              <span>Apps</span><strong>{{ selectedApps.length > 0 ? selectedApps.join(', ') : 'None' }}</strong>
            </div>
          </div>
        </form>
      </div>
    </template>
    <template #actions>
      <div class="dialog-actions">
        <Button
          v-if="wizardStep > 1"
          size="md"
          variant="subtle"
          @click="onPreviousStep"
        >
          Back
        </Button>
        <Button
          v-if="wizardStep < 4"
          size="md"
          variant="solid"
          @click="onNextStep"
        >
          Next
        </Button>
        <Button
          v-if="wizardStep === 4"
          size="md"
          variant="solid"
          :loading="creating"
          :disabled="loading"
          @click="onCreateSite"
        >
          {{ creating ? 'Creating…' : 'Create site' }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Button, Dialog, FormLabel, Select, Switch, TextInput } from 'frappe-ui';
import IconChevronRight from '~icons/lucide/chevron-right';
import AppPicker from './AppPicker.vue';
import { useSites } from '../composables/useSites';
import { useBenches } from '../composables/useBenches';
import { useIpc } from '../composables/useIpc';
import {
  buildSiteCreatePayload,
  getSiteWizardStepErrors,
  toSiteDomain,
  suggestSitePath,
  type SiteWizardStep,
} from '../site-wizard';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  'created': [];
}>();

const ipc = useIpc();
const { sites, loading, creating, create } = useSites();
const { benches: allBenches, loading: benchLoading } = useBenches();

const SELECT_NONE = '__none__';

const createForm = reactive({
  name: '',
  benchId: '',
  path: '',
  appsText: '',
  appsSelected: [] as string[],
  force: false,
});

const wizardStep = ref<SiteWizardStep>(1);
const wizardErrors = ref<string[]>([]);
const defaultInstalledSiteApps = ['frappe'];
const selectedApps = computed(() => createForm.appsSelected);

const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));
const createBenchSelection = computed({
  get: () => createForm.benchId || SELECT_NONE,
  set: (value: string) => {
    createForm.benchId = value === SELECT_NONE ? '' : value;
  },
});
const createBenchOptions = computed(() => [
  { label: 'Choose a bench…', value: SELECT_NONE },
  ...creatableBenches.value.map((bench) => ({
    label: `${bench.name} (${bench.status})`,
    value: bench.id,
  })),
]);

const selectedBench = computed(() => allBenches.value.find((bench) => bench.id === createForm.benchId) ?? null);
const selectedBenchAppIds = computed(() => {
  const apps = selectedBench.value?.apps ?? [];
  return [...new Set(apps.map((app) => app.trim()).filter(Boolean))];
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (!createForm.benchId && creatableBenches.value.length === 1) {
        createForm.benchId = creatableBenches.value[0].id;
      }
    }
  }
);

watch(
  () => createForm.name,
  (newName) => {
    if (selectedBench.value && !createForm.force) {
      const sanitizedName = toSiteDomain(newName);
      createForm.path = suggestSitePath(selectedBench.value.path, sanitizedName);
    }
  }
);

const onNextStep = async () => {
  const errors = getSiteWizardStepErrors(wizardStep.value, createForm);
  if (wizardStep.value === 2) {
    const siteDomain = toSiteDomain(createForm.name);
    const duplicateInDb = sites.value.find(s => s.name === siteDomain);
    if (duplicateInDb && !createForm.force) {
      errors.push(`A site named "${siteDomain}" already exists in the database. Enable "Force create" to overwrite.`);
    }
    if (!createForm.force && createForm.path) {
      const exists = await ipc.pathExists(createForm.path);
      if (exists) {
        errors.push('Site already exists at this path. Enable "Force create" to overwrite.');
      }
    }
  }
  wizardErrors.value = errors;
  if (errors.length > 0) return;
  if (wizardStep.value < 4) wizardStep.value = (wizardStep.value + 1) as SiteWizardStep;
};

const onPreviousStep = () => {
  wizardErrors.value = [];
  if (wizardStep.value > 1) wizardStep.value = (wizardStep.value - 1) as SiteWizardStep;
};

const onCloseSiteWizard = () => {
  wizardStep.value = 1;
  wizardErrors.value = [];
  createForm.name = '';
  createForm.benchId = '';
  createForm.path = '';
  createForm.appsText = '';
  createForm.appsSelected = [];
  createForm.force = false;
  emit('update:open', false);
};

const onCreateSite = async () => {
  const result = buildSiteCreatePayload(createForm);
  wizardErrors.value = result.errors;
  if (!result.payload) return;

  try {
    await create(result.payload);
    emit('created');
    onCloseSiteWizard();
  } catch (err) {
    wizardErrors.value = [String(err)];
  }
};
</script>

<style scoped>
.site-wizard-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wizard-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0 8px;
}

.wizard-header__item {
  font-size: 0.95rem;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.wizard-header__item--active {
  color: var(--text-primary);
  font-weight: 500;
}

.wizard-header__item--inactive {
  color: var(--text-muted);
}

.wizard-header__icon {
  width: 15px;
  height: 15px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-grid {
  display: grid;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wizard-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wizard-summary > div {
  font-size: 13px;
}

.wizard-summary strong {
  font-weight: 600;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
