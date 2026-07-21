<template>
  <WizardDialog
    :open="open"
    title="New site"
    :steps="computedSteps"
    :current-step="fixedBenchId ? wizardStep - 1 : wizardStep"
    :errors="wizardErrors"
    :creating="creating"
    :loading="loading"
    submit-label="Create site"
    @update:open="$emit('update:open', $event)"
    @close="onCloseSiteWizard"
    @next="onNextStep"
    @previous="onPreviousStep"
    @submit="onCreateSite"
  >
    <div
      v-if="wizardStep === 1"
      class="grid gap-4"
    >
      <label class="flex flex-col gap-1.5">
        <span class="mb-1 text-xs-medium text-ink-gray-6">Select bench</span>
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
      class="grid gap-4"
    >
      <label class="flex flex-col gap-1.5">
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
    </div>

    <div
      v-if="wizardStep === 3"
      class="flex flex-col gap-2 p-4 rounded bg-surface-gray-2 text-[13px] text-ink-gray-9"
    >
      <div class="flex justify-between mb-2 text-ink-gray-5">
        <span>Bench</span><strong class="font-semibold text-ink-gray-9">{{ selectedBench?.name ?? createForm.benchId }}</strong>
      </div>
      <div class="flex justify-between mb-2 text-ink-gray-5">
        <span>Site</span><strong class="font-semibold text-ink-gray-9">{{ toSiteDomain(createForm.name) }}</strong>
      </div>
    </div>
  </WizardDialog>
</template>

<script setup lang="ts">
import { FormLabel, Select, TextInput } from 'frappe-ui';
import { computed, reactive, ref, watch } from 'vue';
import WizardDialog from '@frappe-local/renderer/components/dialogs/WizardDialog.vue';
import { useBenches, useSites } from '@frappe-local/renderer/composables/data';

import { useIpc } from '@frappe-local/renderer/composables/system';
import { buildSiteCreatePayload, getSiteWizardStepErrors, suggestSitePath, toSiteDomain, type SiteWizardStep } from '@frappe-local/renderer/controllers';

import type { SiteListItem } from '@frappe-local/shared/core';

const props = defineProps<{ open: boolean; fixedBenchId?: string }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  'created': [site: SiteListItem];
}>();

const ipc = useIpc();
const { sites, loading, creating, create, refresh } = useSites();
const { benches: allBenches, loading: benchLoading } = useBenches();

const SELECT_NONE = '__none__';

const createForm = reactive({
  name: '',
  benchId: '',
  path: '',
});

const wizardStep = ref<SiteWizardStep>(1);
const wizardErrors = ref<string[]>([]);

const computedSteps = computed(() => props.fixedBenchId ? ['Details', 'Confirm'] : ['Bench', 'Details', 'Confirm']);

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

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      refresh();
      if (props.fixedBenchId) {
        createForm.benchId = props.fixedBenchId;
        wizardStep.value = 2;
      } else {
        wizardStep.value = 1;
        const [onlyBench] = creatableBenches.value;
        if (!createForm.benchId && onlyBench && creatableBenches.value.length === 1) {
          createForm.benchId = onlyBench.id;
        }
      }
    }
  }
);

watch(
  () => [createForm.name, wizardStep.value] as const,
  ([newName, step]) => {
    if (selectedBench.value) {
      const sanitizedName = toSiteDomain(newName);
      createForm.path = suggestSitePath(selectedBench.value.path, sanitizedName);
    }
    if (step === 2 && newName.trim()) {
      const errors = getSiteWizardStepErrors(2, createForm, sites.value);
      wizardErrors.value = errors;
    } else {
      wizardErrors.value = [];
    }
  }
);

const onNextStep = async () => {
  const errors = getSiteWizardStepErrors(wizardStep.value, createForm, sites.value);
  if (wizardStep.value === 2) {
    if (createForm.path) {
      const exists = await ipc.pathExists(createForm.path);
      if (exists) {
        errors.push('Site already exists at this path. Please choose a different name.');
      }
    }
  }
  wizardErrors.value = errors;
  if (errors.length > 0) return;
  if (wizardStep.value < 3) wizardStep.value = (wizardStep.value + 1) as SiteWizardStep;
};

const onPreviousStep = () => {
  wizardErrors.value = [];
  const minStep = props.fixedBenchId ? 2 : 1;
  if (wizardStep.value > minStep) wizardStep.value = (wizardStep.value - 1) as SiteWizardStep;
};

const onCloseSiteWizard = () => {
  wizardStep.value = props.fixedBenchId ? 2 : 1;
  wizardErrors.value = [];
  createForm.name = '';
  createForm.benchId = props.fixedBenchId ? props.fixedBenchId : '';
  createForm.path = '';
  emit('update:open', false);
};

const onCreateSite = async () => {
  const result = buildSiteCreatePayload(createForm);
  wizardErrors.value = result.errors;
  if (!result.payload) return;

  try {
    const createdSite = await create(result.payload);
    if (createdSite) {
      emit('created', createdSite);
      onCloseSiteWizard();
    }
  } catch (err) {
    wizardErrors.value = [String(err)];
  }
};
</script>
