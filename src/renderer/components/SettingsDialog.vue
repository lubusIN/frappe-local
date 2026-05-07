<template>
  <Dialog
    v-model="isShowing"
    :options="{
      title: 'Settings',
      description: 'Manage application preferences and storage paths.',
      size: 'xl',
    }"
  >
    <template #body-content>
      <div class="py-1">
        <StatePanel
          v-if="error"
          kind="error"
          title="Unable to load settings"
          :body="error"
          action-label="Retry"
          @action="refresh"
        />
        <StatePanel
          v-else-if="loading"
          kind="loading"
          title="Loading settings"
          body="Reading current preferences and runtime defaults."
        />

        <div v-else>
          <div
            v-if="successMessage"
            class="mb-4 flex items-center gap-2 rounded-md border border-outline-green-2 bg-surface-green-2 px-3 py-2 text-[13px] text-ink-green-3"
          >
            <IconCheckCircle class="h-4 w-4" />
            {{ successMessage }}
          </div>

          <form
            class="space-y-6"
            @submit.prevent="save"
          >
            <div class="grid grid-cols-2 gap-6">
              <div class="space-y-1.5">
                <FormLabel label="Default Frappe Version" />
                <FrappeVersionSelect v-model="form.defaultFrappeVersion" />
              </div>
            </div>

            <div class="space-y-1.5">
              <FormLabel
                label="Storage Path"
                required
              />
              <div class="flex gap-2">
                <div class="flex-1">
                  <TextInput
                    v-model="form.storagePath"
                    placeholder="/path/to/storage"
                    required
                  />
                </div>
                <Button
                  size="md"
                  variant="subtle"
                  @click="onPickStoragePath"
                >
                  Browse
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end w-full gap-2">
        <Button
          size="md"
          variant="subtle"
          @click="$emit('close')"
        >
          Cancel
        </Button>
        <Button
          size="md"
          variant="solid"
          :loading="saving"
          @click="onSave"
        >
          Save settings
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Dialog, Button, FormLabel, TextInput } from 'frappe-ui';
import IconCheckCircle from '~icons/lucide/check-circle';
import StatePanel from './StatePanel.vue';
import FrappeVersionSelect from './FrappeVersionSelect.vue';
import { useSettings } from '../composables/useSettings';
import { useIpc } from '../composables/useIpc';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { form, loading, saving, error, successMessage, refresh, save } = useSettings();
const ipc = useIpc();

const isShowing = computed({
  get: () => props.open,
  set: (val) => {
    if (!val) emit('close');
  },
});


const onPickStoragePath = async () => {
  const selectedPath = await ipc.pickBenchFolder();
  if (selectedPath) {
    form.value.storagePath = selectedPath;
  }
};

const onSave = async () => {
  await save();
  if (!error.value) {
    setTimeout(() => {
      successMessage.value = null;
    }, 2000);
  }
};
</script>
