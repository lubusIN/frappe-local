<template>
  <Dialog
    v-model="isShowing"
    title="Settings"
    message="Manage application preferences and storage paths."
    size="xl"
  >
    <template #default>
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
          <form
            class="space-y-6"
            @submit.prevent="save"
          >
            <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div class="space-y-1.5 md:col-span-2">
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

            <div
              v-if="systemResources.podmanMachineRequired"
              class="rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-4"
            >
              <div class="flex items-start justify-between gap-6">
                <div class="min-w-0">
                  <FormLabel label="Podman Memory" />
                  <p class="mt-1 text-xs leading-5 text-ink-gray-6">
                    Set the memory available to local benches and sites.
                  </p>
                </div>
                <span class="shrink-0 rounded-md border border-outline-gray-2 bg-surface-base px-2.5 py-1 text-sm-semibold text-ink-gray-8">
                  {{ formatMemory(form.podmanMemoryMb) }}
                </span>
              </div>

              <div class="mt-5">
                <Slider
                  v-model="memorySliderValue"
                  class="cursor-pointer [&_[role=slider]]:cursor-pointer"
                  :min="MIN_PODMAN_MEMORY_MB"
                  :max="systemResources.totalMemoryMb"
                  :step="1024"
                />
                <div class="mt-2 flex justify-between text-[11px] text-ink-gray-5">
                  <span>{{ formatMemory(MIN_PODMAN_MEMORY_MB) }}</span>
                  <span>{{ formatMemory(systemResources.totalMemoryMb) }}</span>
                </div>
              </div>

              <div class="mt-4 flex flex-col gap-3 border-t border-outline-gray-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="text-xs leading-5">
                  <p class="font-medium text-ink-gray-7">
                    Recommended: {{ formatMemory(systemResources.recommendedPodmanMemoryMb) }}
                  </p>
                  <p class="text-ink-gray-5">
                    Saving a change briefly restarts Podman.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="subtle"
                  class="shrink-0"
                  @click="useRecommendedMemory"
                >
                  Use recommended
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
import { Button, Dialog, FormLabel, Slider, TextInput, toast } from 'frappe-ui';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import StatePanel from '../ui/StatePanel.vue';
import FrappeVersionSelect from '../ui/FrappeVersionSelect.vue';
import { useSettings } from '../../composables/data/useSettings';
import { useIpc } from '../../composables/system/useIpc';
import { MIN_PODMAN_MEMORY_MB } from '../../../shared/domain/models';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { form, loading, saving, error, configured, refresh, save } = useSettings();
const ipc = useIpc();
const systemResources = reactive({
  totalMemoryMb: MIN_PODMAN_MEMORY_MB,
  recommendedPodmanMemoryMb: MIN_PODMAN_MEMORY_MB,
  podmanMachineRequired: false,
});
const systemResourcesLoaded = ref(false);

const memorySliderValue = computed<number[]>({
  get: () => [form.value.podmanMemoryMb],
  set: ([memoryMb]) => {
    if (typeof memoryMb === 'number') {
      form.value.podmanMemoryMb = memoryMb;
    }
  },
});

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

const formatMemory = (memoryMb: number): string => {
  const memoryGb = memoryMb / 1024;
  return `${Number.isInteger(memoryGb) ? memoryGb : memoryGb.toFixed(1)} GB`;
};

const useRecommendedMemory = (): void => {
  form.value.podmanMemoryMb = systemResources.recommendedPodmanMemoryMb;
};

const onSave = async () => {
  await save();
  if (!error.value) {
    toast.success('Settings saved successfully.');
  }
};

onMounted(async () => {
  try {
    Object.assign(systemResources, await ipc.getSystemResources());
    systemResourcesLoaded.value = true;
  } catch {
    // Keep the safe 4 GB fallback when host resource detection is unavailable.
  }
});

watch(
  [systemResourcesLoaded, loading],
  ([resourcesReady, settingsLoading]) => {
    if (!resourcesReady || settingsLoading) {
      return;
    }
    form.value.podmanMemoryMb = configured.value
      ? Math.min(
        Math.max(form.value.podmanMemoryMb, MIN_PODMAN_MEMORY_MB),
        systemResources.totalMemoryMb
      )
      : systemResources.recommendedPodmanMemoryMb;
  },
  { immediate: true }
);
</script>
