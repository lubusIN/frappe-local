<template>
  <Dialog
    :model-value="open"
    :options="{ title: 'New bench', size: '3xl' }"
    @update:model-value="$emit('update:open', $event)"
    @close="onCloseBenchWizard"
  >
    <template #body-content>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2.5 px-0 py-1">
          <span :class="['text-[0.95rem] leading-tight tracking-[-0.01em]', wizardStep === 1 ? 'font-medium text-ink-gray-9' : 'font-normal text-ink-gray-5']">
            Details
          </span>
          <IconChevronRight class="size-[15px] shrink-0 text-ink-gray-5" />
          <span :class="['text-[0.95rem] leading-tight tracking-[-0.01em]', wizardStep === 2 ? 'font-medium text-ink-gray-9' : 'font-normal text-ink-gray-5']">
            Apps
          </span>
          <IconChevronRight class="size-[15px] shrink-0 text-ink-gray-5" />
          <span :class="['text-[0.95rem] leading-tight tracking-[-0.01em]', wizardStep === 3 ? 'font-medium text-ink-gray-9' : 'font-normal text-ink-gray-5']">
            Confirm
          </span>
        </div>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="onCreateBench"
        >
          <p
            v-if="wizardErrors.length > 0"
            class="mb-4 text-sm text-ink-red-3"
          >
            {{ wizardErrors.join(' ') }}
          </p>

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
            class="grid gap-4"
          >
            <label class="flex flex-col gap-1.5">
              <AppPicker
                v-model="createForm.appsSelected"
                class="w-full"
                :disabled="creating || loading"
                :frappe-version="createForm.frappeVersion"
                :disable-core-bench-apps="true"
              />
            </label>
          </div>

          <div
            v-if="wizardStep === 3"
            class="flex flex-col gap-2 p-4 rounded bg-surface-gray-2"
          >
            <div class="mb-2 flex justify-between text-[13px]">
              <span>Name</span><strong class="font-semibold">{{ createForm.name }}</strong>
            </div>
            <div class="mb-2 flex justify-between text-[13px]">
              <span>Frappe Version</span><strong class="font-semibold">{{ createForm.frappeVersion }}</strong>
            </div>
            <div class="mb-2 flex justify-between text-[13px]">
              <span>Path</span><strong class="font-mono text-xs font-semibold break-all">{{ createForm.path }}</strong>
            </div>
            <div class="flex justify-between text-[13px]">
              <span>Apps</span><strong class="font-semibold">{{ createForm.appsSelected.length > 0 ? `${CORE_BENCH_APPS_LABEL}, ${createForm.appsSelected.join(', ')}` : CORE_BENCH_APPS_LABEL }}</strong>
            </div>
          </div>
        </form>
      </div>
    </template>

    <template #actions>
      <div class="flex justify-end gap-3">
        <Button
          v-if="wizardStep > 1"
          size="md"
          variant="subtle"
          @click="onPreviousStep"
        >
          Back
        </Button>
        <Button
          v-if="wizardStep < 3"
          size="md"
          variant="solid"
          @click="onNextStep"
        >
          Next
        </Button>
        <Button
          v-if="wizardStep === 3"
          size="md"
          variant="solid"
          :loading="creating"
          :disabled="loading"
          @click="onCreateBench"
        >
          {{ creating ? 'Creating…' : 'Create bench' }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Button, Dialog, FormLabel, TextInput } from 'frappe-ui';
import IconChevronRight from '~icons/lucide/chevron-right';
import AppPicker from './AppPicker.vue';
import FrappeVersionSelect from './FrappeVersionSelect.vue';
import { useBenches } from '../composables/useBenches';
import { useIpc } from '../composables/useIpc';
import { useSettings } from '../composables/useSettings';
import {
  buildBenchCreatePayload,
  getBenchWizardStepErrors,
  type BenchWizardStep,
} from '../bench-wizard';
import { CORE_BENCH_APPS_LABEL } from '../../shared/bench-apps';
import { toSelectorFrappeVersion } from '../frappe-version';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  'created': [];
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
  appsText: '',
  appsSelected: [] as string[],
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
  createForm.appsSelected = [];
  emit('update:open', false);
};

const onCreateBench = async () => {
  const result = buildBenchCreatePayload(createForm);
  wizardErrors.value = result.errors;
  if (!result.payload) return;

  try {
    await create(result.payload);
    emit('created');
    onCloseBenchWizard();
  } catch (err) {
    wizardErrors.value = [String(err)];
  }
};
</script>
