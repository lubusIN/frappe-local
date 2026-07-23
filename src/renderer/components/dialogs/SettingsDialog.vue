<template>
  <SettingsDialog
    v-model="isShowing"
    v-model:tab="activeTab"
    size="5xl"
  >
    <template #title>
      User Preferences
    </template>
    <template #description>
      Manage your local benches, updates, and runtime settings.
    </template>

    <!-- Sidebar -->
    <SettingsSidebar>
      <SettingsNavGroup label="User Preferences">
        <SettingsNavItem value="general">
          <template #prefix>
            <i class="lucide-settings size-4" />
          </template>
          General
        </SettingsNavItem>
        <SettingsNavItem value="appearance">
          <template #prefix>
            <i class="lucide-palette size-4" />
          </template>
          Appearance
        </SettingsNavItem>
        <SettingsNavItem value="advanced">
          <template #prefix>
            <i class="lucide-sliders-horizontal size-4" />
          </template>
          Advanced
        </SettingsNavItem>
        <SettingsNavItem value="updates">
          <template #prefix>
            <i class="lucide-download size-4" />
          </template>
          Updates
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>

    <!-- Content Pane with Footer -->
    <div class="flex flex-1 flex-col min-w-0 min-h-0">
      <SettingsContent class="flex-1">
        <!-- General Tab -->
        <SettingsPanel value="general">
          <SettingsHeader
            title="Preferences"
            description="Choose how you want to use the application by setting your preferences."
          />
          <SettingsBody>
            <div>
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
                class="divide-y divide-outline-gray-2"
              >
                <SettingsRow
                  title="Default Frappe Version"
                  description="Select the Frappe version to use when creating new benches."
                >
                  <FrappeVersionSelect v-model="form.defaultFrappeVersion" />
                </SettingsRow>

                <SettingsRow
                  title="Storage Path"
                  description="The directory where all your local benches and sites will be stored."
                >
                  <div class="flex gap-2 w-full sm:w-80">
                    <FormControl
                      v-model="form.storagePath"
                      type="text"
                      placeholder="/path/to/storage"
                      required
                      class="flex-1"
                    />
                    <Button
                      size="md"
                      variant="subtle"
                      @click="onPickStoragePath"
                    >
                      Browse
                    </Button>
                  </div>
                </SettingsRow>

                <SettingsRow
                  title="Terminal"
                  description="Select the terminal application to use when opening bench shells."
                >
                  <div class="flex flex-col gap-2 w-full sm:w-80">
                    <FormControl
                      v-model="selectedTerminalOption"
                      type="select"
                      :options="terminalOptions"
                    />
                    <FormControl
                      v-if="selectedTerminalOption === 'custom'"
                      v-model="form.terminalPreference"
                      type="text"
                      placeholder="Custom command or binary path (e.g., /usr/local/bin/my-term)"
                    />
                  </div>
                </SettingsRow>
              </div>
            </div>
          </SettingsBody>
        </SettingsPanel>

        <!-- Appearance Tab -->
        <SettingsPanel value="appearance">
          <SettingsHeader
            title="Appearance"
            description="Customize the look and feel of the application."
          />
          <SettingsBody>
            <div class="py-4">
              <ThemeSwitcher
                v-model="form.theme"
                name="Local"
                :logo="AppLogo"
              />
            </div>
          </SettingsBody>
        </SettingsPanel>

        <!-- Advanced Tab -->
        <SettingsPanel value="advanced">
          <SettingsHeader
            title="Advanced"
            description="Manage technical and resource settings."
          />
          <SettingsBody>
            <div class="divide-y divide-outline-gray-2">
              <SettingsRow title="App Registry URL">
                <template #description>
                  Custom brewery URL to fetch apps from.
                  <span
                    v-if="breweryValidationMessage"
                    class="block mt-1 font-medium"
                    :class="breweryValidationSuccess ? 'text-green-600' : 'text-red-600'"
                  >
                    {{ breweryValidationMessage }}
                  </span>
                </template>
                <div class="flex items-center gap-2 w-full sm:w-80">
                  <FormControl
                    v-model="form.breweryUrl"
                    type="text"
                    placeholder="https://frappe-brewery.lubus.in/"
                    class="flex-1"
                    :disabled="saving || validatingBrewery"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!form.breweryUrl || form.breweryUrl === DEFAULT_BREWERY_URL || saving || validatingBrewery"
                    @click="resetToDefaultBrewery"
                  >
                    Use Default
                  </Button>
                </div>
              </SettingsRow>

              <SettingsRow
                title="Share SSH Keys with Benches"
                description="Mounts your local ~/.ssh directory into benches to fetch private GitHub repos."
              >
                <Switch
                  v-model="form.shareSshKeys"
                  size="sm"
                  :disabled="saving || isRestartingSsh"
                />
              </SettingsRow>

              <div
                v-if="systemResources.podmanMachineRequired"
                class="pb-3.5 space-y-3"
              >
                <SettingsRow
                  title="Memory"
                  description="Set the memory available to local benches and sites."
                >
                  <span class="shrink-0 rounded-md border border-outline-gray-2 bg-surface-base px-2.5 py-1 text-sm-semibold text-ink-gray-8">
                    {{ formatMemory(currentMemoryMb) }}
                  </span>
                </SettingsRow>

                <div class="mt-2">
                  <Slider
                    v-model="memorySliderValue"
                    class="cursor-pointer [&_[role=slider]]:cursor-pointer"
                    :disabled="saving"
                    :min="MIN_PODMAN_MEMORY_MB"
                    :max="systemResources.totalMemoryMb"
                    :step="1024"
                  />
                  <div class="mt-2 flex justify-between text-[11px] text-ink-gray-5">
                    <span>{{ formatMemory(MIN_PODMAN_MEMORY_MB) }}</span>
                    <span>{{ formatMemory(systemResources.totalMemoryMb) }}</span>
                  </div>
                </div>

                <div class="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="text-xs leading-5">
                    <p class="font-medium text-ink-gray-7">
                      Recommended: {{ formatMemory(systemResources.recommendedPodmanMemoryMb) }}
                    </p>
                    <p class="text-ink-gray-5">
                      Applying a memory change will restart environment.
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="subtle"
                      class="shrink-0"
                      :disabled="saving"
                      @click="useRecommendedMemory"
                    >
                      Use recommended
                    </Button>
                    <Button
                      v-if="memoryHasChanged"
                      size="sm"
                      variant="solid"
                      :loading="saving"
                      @click="onApplyMemory"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </SettingsBody>
        </SettingsPanel>

        <!-- Updates Tab -->
        <SettingsPanel value="updates">
          <SettingsHeader
            title="Updates"
            description="Manage how Frappe Local receives updates."
          />
          <SettingsBody>
            <div class="divide-y divide-outline-gray-2">
              <SettingsRow
                title="Auto Update"
                description="Automatically check for and download updates in the background."
              >
                <Switch
                  v-model="form.autoUpdateEnabled"
                  size="sm"
                />
              </SettingsRow>

              <SettingsRow
                title="Update Channel"
                description="Choose how early you'd like to receive new updates."
              >
                <FormControl
                  v-model="form.updateChannel"
                  type="select"
                  :options="[
                    { label: 'Stable', value: 'stable' },
                    { label: 'Dev', value: 'dev' }
                  ]"
                />
              </SettingsRow>

              <SettingsRow
                title="Check for Updates"
                :description="`Last checked: ${formattedLastChecked}${updateMessage ? ' - ' + updateMessage : ''}`"
              >
                <div class="flex items-center gap-2">
                  <Button
                    v-if="isUpdateAvailable"
                    size="sm"
                    variant="solid"
                    :loading="isDownloadingUpdate"
                    @click="onDownloadUpdate"
                  >
                    Download & Install
                  </Button>
                  <Button
                    v-else
                    size="sm"
                    variant="subtle"
                    :loading="isCheckingForUpdates"
                    @click="onCheckForUpdates"
                  >
                    Check Now
                  </Button>
                </div>
              </SettingsRow>
            </div>
          </SettingsBody>
        </SettingsPanel>
      </SettingsContent>
    </div>
  </SettingsDialog>

  <ConfirmationDialog
    :open="showSshConfirmation"
    title="Restart Running Benches?"
    message="Changing SSH Key sharing requires a restart of all running benches."
    confirm-label="Proceed"
    @confirm="onConfirmSshSave"
    @cancel="onCancelSshSave"
  />
</template>

<script setup lang="ts">
import { Button, FormControl, SettingsBody, SettingsContent, SettingsDialog, SettingsHeader, SettingsNavGroup, SettingsNavItem, SettingsPanel, SettingsRow, SettingsSidebar, Slider, Switch, ThemeSwitcher, toast } from 'frappe-ui';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { AvailableTerminal } from '@frappe-local/shared/core';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import FrappeVersionSelect from '@frappe-local/renderer/components/ui/FrappeVersionSelect.vue';
import AppLogo from '@frappe-local/renderer/components/ui/AppLogo.vue';
import ConfirmationDialog from '@frappe-local/renderer/components/dialogs/ConfirmationDialog.vue';
import { useSettings } from '@frappe-local/renderer/composables/data';
import { useIpc, useSshKeys } from '@frappe-local/renderer/composables/system';

import { DEFAULT_BREWERY_URL, MIN_PODMAN_MEMORY_MB } from '@frappe-local/shared/domain';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const ipc = useIpc();
const activeTab = ref('general');

const isCheckingForUpdates = ref(false);
const isUpdateAvailable = ref(false);
const isDownloadingUpdate = ref(false);
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
  isUpdateAvailable.value = false;
  try {
    const result = await ipc.checkForUpdates();
    lastCheckedAt.value = result.checkedAt;
    localStorage.setItem('frappeLocal:lastUpdateCheck', result.checkedAt);
    
    if (result.status === 'update-available') {
      updateMessage.value = result.message;
      isUpdateAvailable.value = true;
      toast({ title: 'Update Available', text: result.message, icon: 'download' });
    } else if (result.status === 'up-to-date') {
      updateMessage.value = 'No updates available.';
      toast({ title: 'Up to date', text: 'No updates available.', icon: 'check', iconClasses: 'text-green-600' });
    } else {
      updateMessage.value = result.message;
      toast({ title: 'Update Check', text: result.message, icon: 'info' });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to check for updates.';
    updateMessage.value = errorMsg;
    toast({ title: 'Error', text: errorMsg, icon: 'x' });
  } finally {
    isCheckingForUpdates.value = false;
  }
};

const onDownloadUpdate = async () => {
  isDownloadingUpdate.value = true;
  updateMessage.value = 'Downloading update...';
  try {
    await ipc.downloadUpdate();
    updateMessage.value = 'Update downloaded and ready to install.';
  } catch (error) {
    updateMessage.value = error instanceof Error ? error.message : 'Failed to download update.';
  } finally {
    isDownloadingUpdate.value = false;
  }
};

const { form, loading, saving, error, originalSettings, refresh, save, configured } = useSettings();
const systemResources = reactive({
  totalMemoryMb: MIN_PODMAN_MEMORY_MB,
  recommendedPodmanMemoryMb: MIN_PODMAN_MEMORY_MB,
  podmanMachineRequired: false,
});
const systemResourcesLoaded = ref(false);

const pendingMemoryMb = ref<number | null>(null);

const currentMemoryMb = computed(() => pendingMemoryMb.value ?? form.value.podmanMemoryMb);

const memorySliderValue = computed<number[]>({
  get: () => [currentMemoryMb.value],
  set: ([memoryMb]) => {
    if (typeof memoryMb === 'number') {
      pendingMemoryMb.value = memoryMb;
    }
  },
});

const memoryHasChanged = computed(() => {
  return pendingMemoryMb.value !== null && pendingMemoryMb.value !== form.value.podmanMemoryMb;
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

const availableTerminals = ref<AvailableTerminal[]>([{ id: 'default', name: 'System Default' }]);
const terminalOptions = computed(() => [
  ...availableTerminals.value.map((t) => ({ label: t.name, value: t.id })),
  { label: 'Custom...', value: 'custom' },
]);

const selectedTerminalOption = computed({
  get: () => {
    const pref = form.value.terminalPreference ?? 'default';
    const exists = availableTerminals.value.some((t) => t.id === pref);
    return exists ? pref : 'custom';
  },
  set: (val: string) => {
    if (val !== 'custom') {
      form.value.terminalPreference = val;
    } else if (availableTerminals.value.some((t) => t.id === form.value.terminalPreference)) {
      form.value.terminalPreference = '';
    }
  },
});

const formatMemory = (memoryMb: number): string => {
  const memoryGb = memoryMb / 1024;
  return `${Number.isInteger(memoryGb) ? memoryGb : memoryGb.toFixed(1)} GB`;
};

const useRecommendedMemory = (): void => {
  pendingMemoryMb.value = systemResources.recommendedPodmanMemoryMb;
};

const onApplyMemory = async () => {
  if (!memoryHasChanged.value || pendingMemoryMb.value === null) return;
  
  form.value.podmanMemoryMb = pendingMemoryMb.value;
  
  const promise = save().then(() => {
    if (error.value) throw new Error(error.value);
    pendingMemoryMb.value = null;
  });
  
  toast.promise(promise, {
    loading: 'Updating memory and restarting environment',
    success: 'Memory updated and environment restarted.',
    error: (err: Error) => `Failed to apply memory changes: ${err.message}`,
  });
};

const { showSshConfirmation, pendingSshValue, isRestartingSsh, handleSshToggle, performSshSave } = useSshKeys();

const validatingBrewery = ref(false);
const breweryValidationMessage = ref('');
const breweryValidationSuccess = ref(true);

const resetToDefaultBrewery = () => {
  form.value.breweryUrl = DEFAULT_BREWERY_URL;
  breweryValidationMessage.value = '';
};

const performSave = async () => {
  await save();
  if (!error.value) {
    toast.success('Settings saved successfully.');
  }
};

const onSave = async () => {
  if (saving.value) return;

  breweryValidationMessage.value = '';
  if (form.value.breweryUrl && form.value.breweryUrl.trim() && form.value.breweryUrl !== originalSettings.value?.breweryUrl) {
    validatingBrewery.value = true;
    breweryValidationMessage.value = 'Validating app registry endpoint...';
    try {
      const validation = await ipc.validateBreweryUrl(form.value.breweryUrl.trim());
      if (!validation.valid) {
        breweryValidationSuccess.value = false;
        breweryValidationMessage.value = `Validation failed: ${validation.error || 'Could not fetch app catalog from this URL.'}`;
        validatingBrewery.value = false;
        return;
      }
      breweryValidationSuccess.value = true;
      breweryValidationMessage.value = `Verified! Found ${validation.appCount} apps.`;
    } catch (err) {
      breweryValidationSuccess.value = false;
      breweryValidationMessage.value = `Validation error: ${err instanceof Error ? err.message : String(err)}`;
      validatingBrewery.value = false;
      return;
    } finally {
      validatingBrewery.value = false;
    }
  }

  if (originalSettings.value && form.value.shareSshKeys !== originalSettings.value.shareSshKeys) {
    await handleSshToggle(form.value.shareSshKeys, async () => {
      await performSave();
      await performSshSave(form.value.shareSshKeys, false);
    });
  } else {
    await performSave();
  }
};

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

watch(
  form,
  (newForm) => {
    if (loading.value || !configured.value || saving.value) return;
    if (JSON.stringify(newForm) === JSON.stringify(originalSettings.value)) return;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      onSave();
    }, 500);
  },
  { deep: true }
);

const onConfirmSshSave = async () => {
  showSshConfirmation.value = false;
  await performSave();
  await performSshSave(pendingSshValue.value, true);
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

  try {
    availableTerminals.value = await ipc.getAvailableTerminals();
  } catch {
    availableTerminals.value = [{ id: 'default', name: 'System Default' }];
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
