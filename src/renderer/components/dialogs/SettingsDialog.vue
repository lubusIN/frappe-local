<template>
  <Dialog
    v-model="isShowing"
    size="5xl"
    bare
  >
    <div class="flex flex-col md:flex-row h-[75vh] sm:h-[80vh] w-full bg-surface-base rounded-xl overflow-hidden shadow-2xl">
      <!-- Sidebar -->
      <Sidebar
        :sections="sidebarSections"
        disable-collapse
        class="shrink-0 border-r border-outline-gray-2 bg-surface-gray-1"
      />

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Scrollable Form Area -->
        <div class="flex-1 overflow-y-auto p-6 sm:p-10">
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

          <div
            v-else
            class="min-h-full"
          >
            <form
              class="space-y-6"
              @submit.prevent="onSave"
            >
              <!-- General Tab -->
              <div v-if="activeTab === 'general'">
                <div class="mb-6">
                  <h2 class="text-lg font-semibold text-ink-gray-9">
                    Preferences
                  </h2>
                  <p class="text-sm text-ink-gray-5 mt-1">
                    Choose how you want to use the application by setting your preferences.
                  </p>
                </div>
                
                <div class="flex flex-col">
                  <div class="pb-5 space-y-1.5">
                    <div>
                      <p class="font-medium leading-normal text-ink-gray-8 text-base">
                        Default Frappe Version
                      </p>
                      <p class="mt-1 text-sm leading-5 text-ink-gray-6 mb-2">
                        Select the Frappe version to use when creating new benches.
                      </p>
                    </div>
                    <FrappeVersionSelect v-model="form.defaultFrappeVersion" />
                  </div>

                  <Divider />

                  <div class="py-5 space-y-1.5">
                    <div>
                      <p class="font-medium leading-normal text-ink-gray-8 text-base">
                        Storage Path
                        <span class="text-red-500 ml-1">*</span>
                      </p>
                      <p class="mt-1 text-sm leading-5 text-ink-gray-6 mb-2">
                        The directory where all your local benches and sites will be stored.
                      </p>
                    </div>
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
                </div>
              </div>

              <!-- Updates Tab -->
              <div v-else-if="activeTab === 'updates'">
                <div class="mb-6">
                  <h2 class="text-lg font-semibold text-ink-gray-9">
                    Updates
                  </h2>
                  <p class="text-sm text-ink-gray-5 mt-1">
                    Manage how Frappe Local receives updates.
                  </p>
                </div>

                <div class="flex flex-col">
                  <div class="pb-5 flex items-center justify-between gap-6">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium leading-normal text-ink-gray-8 text-base">
                        Auto Update
                      </p>
                      <p class="mt-1 text-sm leading-5 text-ink-gray-6">
                        Automatically check for and download updates in the background.
                      </p>
                    </div>
                    <div class="shrink-0">
                      <Switch
                        v-model="form.autoUpdateEnabled"
                        size="sm"
                      />
                    </div>
                  </div>

                  <Divider />

                  <div class="py-5 flex items-center justify-between gap-6">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium leading-normal text-ink-gray-8 text-base">
                        Update Channel
                      </p>
                      <p class="mt-1 text-sm leading-5 text-ink-gray-6">
                        Choose how early you'd like to receive new updates.
                      </p>
                    </div>
                    <Select
                      v-model="form.updateChannel"
                      :options="[
                        { label: 'Stable', value: 'stable' },
                        { label: 'Beta', value: 'beta' },
                        { label: 'Alpha', value: 'alpha' },
                        { label: 'Nightly', value: 'nightly' }
                      ]"
                    />
                  </div>

                  <Divider />

                  <div class="py-5 flex items-center justify-between gap-6">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium leading-normal text-ink-gray-8 text-base">
                        Check for Updates
                      </p>
                      <p class="mt-1 text-sm leading-5 text-ink-gray-6">
                        Last checked: {{ formattedLastChecked }}
                        <span
                          v-if="updateMessage"
                          class="block mt-0.5 text-ink-gray-5"
                        >{{ updateMessage }}</span>
                      </p>
                    </div>
                    <div class="shrink-0">
                      <Button
                        size="sm"
                        variant="subtle"
                        :loading="isCheckingForUpdates"
                        @click="onCheckForUpdates"
                      >
                        Check Now
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Appearance Tab -->
              <div
                v-else-if="activeTab === 'appearance'"
                class="space-y-8"
              >
                <div>
                  <h2 class="text-lg font-semibold text-ink-gray-9">
                    Appearance
                  </h2>
                  <p class="text-sm text-ink-gray-5 mt-1">
                    Customize the look and feel of the application.
                  </p>
                </div>

                <ThemeSwitcher
                  v-model="form.theme"
                  name="Local"
                  :logo="AppLogo"
                />
              </div>

              <!-- Advanced Tab -->
              <div v-else-if="activeTab === 'advanced'">
                <div class="mb-6">
                  <h2 class="text-lg font-semibold text-ink-gray-9">
                    Advanced
                  </h2>
                  <p class="text-sm text-ink-gray-5 mt-1">
                    Manage technical and resource settings.
                  </p>
                </div>

                <div class="flex flex-col">
                  <div class="pb-5 flex items-center justify-between gap-6">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium leading-normal text-ink-gray-8 text-base">
                        Share SSH Keys with Benches
                      </p>
                      <p class="mt-1 text-sm leading-5 text-ink-gray-6">
                        Mounts your local ~/.ssh directory into benches to fetch private GitHub repos.
                      </p>
                    </div>
                    <div class="shrink-0">
                      <Switch
                        v-model="form.shareSshKeys"
                        size="sm"
                      />
                    </div>
                  </div>

                  <Divider />

                  <div
                    v-if="systemResources.podmanMachineRequired"
                    class="py-5"
                  >
                    <div class="flex items-center justify-between gap-6">
                      <div class="min-w-0">
                        <p class="font-medium leading-normal text-ink-gray-8 text-base">
                          Memory
                        </p>
                        <p class="mt-1 text-sm leading-5 text-ink-gray-6">
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

                    <div class="mt-2 flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
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
                </div>
              </div>
            </form>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="border-t border-outline-gray-2 bg-surface-gray-1 px-6 py-4 flex items-center justify-end gap-2 shrink-0">
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
            Save
          </Button>
        </div>
      </div>
    </div>
  </Dialog>

  <ConfirmDialog
    v-model="showSshConfirmation"
    title="Restart Running Benches?"
    message="Changing SSH Key sharing requires a restart of all running benches to apply the new volume mounts. Are you sure you want to proceed?"
    @confirm="onConfirmSshSave"
    @cancel="onCancelSshSave"
  />
</template>

<script setup lang="ts">
import { Button, ConfirmDialog, Dialog, Divider, Select, Sidebar, Slider, Switch, TextInput, ThemeSwitcher, toast } from 'frappe-ui';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import FrappeVersionSelect from '@frappe-local/renderer/components/ui/FrappeVersionSelect.vue';
import AppLogo from '@frappe-local/renderer/components/ui/AppLogo.vue';
import { useSettings } from '@frappe-local/renderer/composables/data';
import { useIpc, useSshKeys } from '@frappe-local/renderer/composables/system';

import { MIN_PODMAN_MEMORY_MB } from '@frappe-local/shared/domain';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const activeTab = ref('general');

const isCheckingForUpdates = ref(false);
const updateMessage = ref<string | null>(null);
const lastCheckedAt = ref<string | null>(localStorage.getItem('frappeLocal:lastUpdateCheck'));

const formattedLastChecked = computed(() => {
  if (!lastCheckedAt.value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(lastCheckedAt.value));
});

const onCheckForUpdates = async () => {
  isCheckingForUpdates.value = true;
  updateMessage.value = null;
  try {
    const result = await window.frappeLocal.checkForUpdates();
    lastCheckedAt.value = result.checkedAt;
    localStorage.setItem('frappeLocal:lastUpdateCheck', result.checkedAt);
    
    if (result.status === 'update-available') {
      updateMessage.value = result.message;
    } else if (result.status === 'up-to-date') {
      updateMessage.value = 'App is up to date.';
    } else {
      updateMessage.value = result.message;
    }
  } catch (error) {
    updateMessage.value = error instanceof Error ? error.message : 'Failed to check for updates.';
  } finally {
    isCheckingForUpdates.value = false;
  }
};

const sidebarSections = computed(() => [
  {
    label: 'User Preferences',
    items: [
      { 
        label: 'General', 
        isActive: activeTab.value === 'general',
        onClick: () => activeTab.value = 'general',
        icon: 'lucide-settings'
      },
      { 
        label: 'Appearance', 
        isActive: activeTab.value === 'appearance',
        onClick: () => activeTab.value = 'appearance',
        icon: 'lucide-palette'
      },
      { 
        label: 'Advanced', 
        isActive: activeTab.value === 'advanced',
        onClick: () => activeTab.value = 'advanced',
        icon: 'lucide-sliders-horizontal'
      },
      { 
        label: 'Updates', 
        isActive: activeTab.value === 'updates',
        onClick: () => activeTab.value = 'updates',
        icon: 'lucide-download'
      },
    ]
  }
]);

const { form, loading, saving, error, originalSettings, refresh, save, configured } = useSettings();
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

const { showSshConfirmation, pendingSshValue, performSshSave } = useSshKeys();

const performSave = async () => {
  await save();
  if (!error.value) {
    toast.success('Settings saved successfully.');
  }
};

const onSave = async () => {
  if (originalSettings.value && form.value.shareSshKeys !== originalSettings.value.shareSshKeys) {
    pendingSshValue.value = form.value.shareSshKeys;
    showSshConfirmation.value = true;
  } else {
    await performSave();
  }
};

const onConfirmSshSave = async () => {
  showSshConfirmation.value = false;
  await performSave();
  await performSshSave(pendingSshValue.value);
};

const onCancelSshSave = () => {
  showSshConfirmation.value = false;
  // Revert toggle
  form.value.shareSshKeys = originalSettings.value?.shareSshKeys ?? false;
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
