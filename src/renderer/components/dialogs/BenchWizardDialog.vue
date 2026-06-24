<template>
  <WizardDialog
    :open="open"
    title="New bench"
    :steps="['Details', 'Confirm']"
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
      <label class="flex flex-col gap-1.5">
        <FormLabel label="Name" />
        <TextInput
          v-model="createForm.name"
          type="text"
          required
          placeholder="my-bench"
          variant="outline"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <FormLabel label="Frappe Version" />
        <FrappeVersionSelect
          v-model="createForm.frappeVersion"
          class="w-full"
        />
      </label>

      <label class="flex flex-col gap-1.5">
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
      </label>
    </div>

    <div
      v-if="wizardStep === 2"
      class="flex flex-col gap-2 p-4 rounded bg-surface-gray-2 text-[13px] text-ink-gray-9"
    >
      <div class="mb-2 flex justify-between text-ink-gray-5">
        <span>Name</span><strong class="font-semibold text-ink-gray-9">{{ createForm.name }}</strong>
      </div>
      <div class="mb-2 flex justify-between text-ink-gray-5">
        <span>Frappe Version</span><strong class="font-semibold text-ink-gray-9">{{ createForm.frappeVersion }}</strong>
      </div>
      <div class="flex justify-between text-ink-gray-5">
        <span>Path</span><strong class="font-mono text-xs-semibold break-all text-ink-gray-9">{{ createForm.path }}</strong>
      </div>
    </div>
  </WizardDialog>
</template>

<script setup lang="ts">
import { Button, FormLabel, TextInput } from 'frappe-ui';
import { reactive, ref, watch } from 'vue';
import WizardDialog from '@frappe-local/renderer/components/dialogs/WizardDialog.vue';
import FrappeVersionSelect from '@frappe-local/renderer/components/ui/FrappeVersionSelect.vue';
import { useBenches } from '@frappe-local/renderer/composables/data/useBenches';
import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';
import { useSettings } from '@frappe-local/renderer/composables/data/useSettings';
import {
  buildBenchCreatePayload,
  getBenchWizardStepErrors,
  type BenchWizardStep,
} from '@frappe-local/renderer/controllers/bench-wizard';
import { toSelectorFrappeVersion } from '@frappe-local/renderer/utils/frappe-version';

import type { BenchListItem } from '@frappe-local/shared/domain/domain-models';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  'created': [bench: BenchListItem];
}>();

const ipc = useIpc();
const { creating, loading, create } = useBenches();
const { form: settingsForm } = useSettings();

const getDefaultFrappeVersion = () => toSelectorFrappeVersion(settingsForm.value.defaultFrappeVersion);

const wizardStep = ref<BenchWizardStep>(1);
const wizardErrors = ref<string[]>([]);
const createForm = reactive({
  name: '',
  path: '',
  frappeVersion: getDefaultFrappeVersion(),
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
  const errors = getBenchWizardStepErrors(wizardStep.value, createForm);
  wizardErrors.value = errors;
  if (errors.length > 0) return;
  if (wizardStep.value < 2) wizardStep.value = (wizardStep.value + 1) as BenchWizardStep;
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
  emit('update:open', false);
};

const onCreateBench = async () => {
  const result = buildBenchCreatePayload(createForm);
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
