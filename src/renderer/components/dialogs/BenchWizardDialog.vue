<template>
  <WizardDialog
    :open="open"
    title="New bench"
    :steps="['Details', 'Site', 'Confirm']"
    :current-step="wizardStep"
    :errors="wizardErrors"
    :creating="creating"
    :loading="loading"
    submit-label="Create bench"
    @update:open="$emit('update:open', $event)"
    @close="onCloseBenchWizard"
    @next="onNextStep"
    @previous="onPreviousStep"
    @submit="onCreateBench"
  >
    <div
      v-if="wizardStep === 1"
      class="grid gap-4"
    >
      <FormControl
        v-model="createForm.name"
        type="text"
        required
        label="Name"
        placeholder="my-bench"
        variant="outline"
      />

      <div class="flex flex-col gap-1.5">
        <FormLabel label="Frappe Version" />
        <FrappeVersionSelect
          v-model="createForm.frappeVersion"
          class="w-full"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <FormLabel label="Path" />
        <div class="flex w-full gap-2">
          <div class="flex-1 min-w-0">
            <TextInput
              v-model="createForm.path"
              type="text"
              required
              placeholder="/path/to/bench"
              variant="outline"
            />
          </div>
          <Button
            size="sm"
            variant="subtle"
            type="button"
            @click="triggerFolderPicker"
          >
            Browse
          </Button>
        </div>
      </div>
    </div>

    <div
      v-if="wizardStep === 2"
      class="grid gap-4"
    >
      <div class="flex flex-col gap-1.5">
        <FormLabel label="Initial Site Name" />
        <TextInput
          v-model="createForm.siteName"
          type="text"
          required
          placeholder="my-site"
          variant="outline"
        >
          <template #suffix>
            <span class="text-p-sm text-ink-gray-6">.localhost</span>
          </template>
        </TextInput>
      </div>
    </div>

    <div
      v-if="wizardStep === 3"
      class="flex flex-col gap-2 p-4 rounded bg-surface-gray-2 text-[13px] text-ink-gray-9"
    >
      <div class="mb-2 flex justify-between text-ink-gray-5">
        <span>Name</span><strong class="font-semibold text-ink-gray-9">{{ createForm.name }}</strong>
      </div>
      <div class="mb-2 flex justify-between text-ink-gray-5">
        <span>Frappe Version</span><strong class="font-semibold text-ink-gray-9">{{ createForm.frappeVersion }}</strong>
      </div>
      <div class="mb-2 flex justify-between text-ink-gray-5">
        <span>Path</span><strong class="font-mono text-xs-semibold break-all text-ink-gray-9">{{ createForm.path }}</strong>
      </div>
      <div class="flex justify-between text-ink-gray-5">
        <span>Initial Site</span><strong class="font-semibold text-ink-gray-9">{{ toSiteDomain(createForm.siteName) }}</strong>
      </div>
    </div>
  </WizardDialog>
</template>

<script setup lang="ts">
import { Button, FormLabel, TextInput, FormControl } from 'frappe-ui';
import { reactive, ref, watch } from 'vue';
import WizardDialog from '@frappe-local/renderer/components/dialogs/WizardDialog.vue';
import FrappeVersionSelect from '@frappe-local/renderer/components/ui/FrappeVersionSelect.vue';
import { useBenches, useSettings, useSites } from '@frappe-local/renderer/composables/data';
import { useIpc } from '@frappe-local/renderer/composables/system';

import { buildBenchCreatePayload, getBenchWizardStepErrors, toSiteDomain, type BenchWizardStep } from '@frappe-local/renderer/controllers';
import { toSelectorFrappeVersion } from '@frappe-local/renderer/utils';

import type { BenchListItem } from '@frappe-local/shared/core';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  'created': [bench: BenchListItem];
}>();

const ipc = useIpc();
const { creating, loading, create } = useBenches();
const { sites } = useSites();
const { form: settingsForm } = useSettings();

const getDefaultFrappeVersion = () => toSelectorFrappeVersion(settingsForm.value.defaultFrappeVersion);

const wizardStep = ref<BenchWizardStep>(1);
const wizardErrors = ref<string[]>([]);
const createForm = reactive({
  name: '',
  path: '',
  frappeVersion: getDefaultFrappeVersion(),
  siteName: '',
});

watch(() => [createForm.name, settingsForm.value.storagePath], ([newName, storagePath], [oldName]) => {
  if (!storagePath) return;

  const oldDefaultPath = oldName ? `${storagePath}/benches/${oldName}` : '';
  const newDefaultPath = newName ? `${storagePath}/benches/${newName}` : '';

  if (!createForm.path || createForm.path === oldDefaultPath || createForm.path === `${storagePath}/benches` || createForm.path === storagePath) {
    createForm.path = newDefaultPath;
  }
});

watch(
  () => settingsForm.value.defaultFrappeVersion,
  (nextValue, previousValue) => {
    const nextDefault = toSelectorFrappeVersion(nextValue);
    const previousDefault = toSelectorFrappeVersion(previousValue);

    if (!createForm.frappeVersion || createForm.frappeVersion === previousDefault) {
      createForm.frappeVersion = nextDefault;
    }
  }
);

const triggerFolderPicker = async () => {
  const selectedPath = await ipc.pickBenchFolder();
  if (selectedPath) {
    const name = createForm.name.trim();
    if (name && !selectedPath.endsWith(name)) {
      createForm.path = selectedPath.endsWith('/') ? `${selectedPath}${name}` : `${selectedPath}/${name}`;
    } else {
      createForm.path = selectedPath;
    }
  }
};

const onNextStep = () => {
  const context = { existingSites: sites.value.map(s => s.name) };
  const errors = getBenchWizardStepErrors(wizardStep.value, createForm, context);
  wizardErrors.value = errors;
  if (errors.length > 0) return;
  if (wizardStep.value < 3) wizardStep.value = (wizardStep.value + 1) as BenchWizardStep;
};

const onPreviousStep = () => {
  wizardErrors.value = [];
  if (wizardStep.value > 1) wizardStep.value = (wizardStep.value - 1) as BenchWizardStep;
};

const onCloseBenchWizard = () => {
  wizardStep.value = 1;
  wizardErrors.value = [];
  createForm.name = '';
  createForm.path = '';
  createForm.frappeVersion = getDefaultFrappeVersion();
  createForm.siteName = '';
  emit('update:open', false);
};

const onCreateBench = async () => {
  const context = { existingSites: sites.value.map(s => s.name) };
  const result = buildBenchCreatePayload(createForm, context);
  wizardErrors.value = result.errors;
  if (!result.payload) return;

  try {
    const createdBench = await create(result.payload);
    if (createdBench) {
      emit('created', createdBench);
      onCloseBenchWizard();
    }
  } catch (err) {
    wizardErrors.value = [String(err)];
  }
};
</script>
