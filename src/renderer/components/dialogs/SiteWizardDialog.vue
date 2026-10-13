<template>
  <WizardDialog
    :open="open"
    title="New site"
    size="xl"
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
      <div class="flex flex-col gap-0 relative">
        <div class="flex flex-col">
          <div
            v-if="benchLoading"
            class="p-4 text-center text-ink-gray-5 text-sm"
          >
            Loading benches...
          </div>
          
          <div
            v-else-if="allBenches.length === 0"
            class="p-4 text-center text-ink-gray-5 text-sm"
          >
            No benches found.
          </div>
          
          <div
            v-else
            class="flex flex-col gap-1 py-1"
          >
            <button
              v-for="bench in allBenches"
              :key="bench.id"
              class="flex items-center justify-between p-2 rounded-6 text-left transition-colors focus:outline-none"
              :class="[
                createForm.benchId === bench.id 
                  ? 'bg-surface-gray-2' 
                  : 'bg-transparent hover:bg-surface-gray-1',
                (bench.status !== 'running' && bench.status !== 'success') ? 'opacity-50 pointer-events-none' : ''
              ]"
              :disabled="bench.status !== 'running' && bench.status !== 'success'"
              @click="selectBench(bench.id)"
            >
              <div class="flex items-center gap-3">
                <div 
                  class="w-2 h-2 rounded-full flex-shrink-0"
                  :class="[
                    (bench.status === 'running' || bench.status === 'success') ? 'bg-green-500' :
                    bench.status === 'stopped' ? 'bg-gray-400' :
                    'bg-red-500'
                  ]"
                />
                <span class="text-sm font-medium text-ink-gray-9">{{ bench.name }}</span>
              </div>
              <span class="text-xs font-mono text-ink-gray-5">{{ bench.frappeVersion }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="wizardErrors.benchId"
          class="text-p-sm text-ink-red-5 mt-1"
        >
          {{ wizardErrors.benchId }}
        </div>
      </div>
    </div>

    <div
      v-if="wizardStep === 2"
      class="grid gap-4"
    >
      <FormControl
        v-model="createForm.name"
        label="Site name"
        type="text"
        required
        placeholder="my-site"
        :error="wizardErrors.name"
      >
        <template #suffix>
          <span class="text-p-sm text-ink-gray-6">.localhost</span>
        </template>
      </FormControl>
    </div>

    <div
      v-if="wizardStep === 3"
      class="flex flex-col gap-2 p-4 rounded-4 bg-surface-gray-2 text-[13px] text-ink-gray-9"
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
import { FormControl } from 'frappe-ui';
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

const createForm = reactive({
  name: '',
  benchId: '',
  path: '',
});

const wizardStep = ref<SiteWizardStep>(1);
const wizardErrors = ref<Record<string, string>>({});

const computedSteps = computed(() => props.fixedBenchId ? ['Site Name', 'Confirm'] : ['Select Bench', 'Site Name', 'Confirm']);

const creatableBenches = computed(() => allBenches.value.filter((bench) => bench.status === 'running' || bench.status === 'success'));

const selectBench = (benchId: string) => {
  createForm.benchId = benchId;
};

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

watch(() => createForm.benchId, () => { if (wizardErrors.value.benchId) delete wizardErrors.value.benchId; });
watch(() => createForm.name, () => { if (wizardErrors.value.name) delete wizardErrors.value.name; });
watch(() => createForm.path, () => { if (wizardErrors.value.path) delete wizardErrors.value.path; });

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
      wizardErrors.value = {};
    }
  }
);

const onNextStep = async () => {
  const errors = getSiteWizardStepErrors(wizardStep.value, createForm, sites.value);
  if (wizardStep.value === 2) {
    if (createForm.path) {
      const exists = await ipc.pathExists(createForm.path);
      if (exists) {
        errors.name = 'Site already exists at this path. Please choose a different name.';
      }
    }
  }
  wizardErrors.value = errors;
  if (Object.keys(errors).length > 0) return;
  if (wizardStep.value < 3) wizardStep.value = (wizardStep.value + 1) as SiteWizardStep;
};

const onPreviousStep = () => {
  wizardErrors.value = {};
  const minStep = props.fixedBenchId ? 2 : 1;
  if (wizardStep.value > minStep) wizardStep.value = (wizardStep.value - 1) as SiteWizardStep;
};

const onCloseSiteWizard = () => {
  wizardStep.value = props.fixedBenchId ? 2 : 1;
  wizardErrors.value = {};
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
    wizardErrors.value = { _global: String(err) };
  }
};
</script>
