<template>
  <SettingsDialog
    v-model:open="isShowing"
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
      <SettingsNavGroup
        v-for="group in groups"
        :key="group.label"
        :label="group.label"
      >
        <SettingsNavItem
          v-for="tab in group.tabs"
          :key="tab.value"
          :value="tab.value"
        >
          <template #prefix>
            <span
              :class="[tab.icon, 'size-4 shrink-0']"
              aria-hidden="true"
            />
          </template>
          {{ tab.label }}
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>

    <!-- Content Pane with Footer -->
    <div class="flex flex-1 flex-col min-w-0 min-h-0">
      <SettingsContent class="flex-1">
        <SettingsPanel
          v-for="tab in tabsList"
          :key="tab.value"
          :value="tab.value"
        >
          <component
            :is="tab.component"
            v-bind="tab.props"
            v-on="tab.events || {}"
          />
        </SettingsPanel>
      </SettingsContent>

      <footer class="flex items-center justify-between shrink-0 border-t border-outline-gray-2 px-6 py-4 bg-surface-gray-1">
        <div class="text-sm text-ink-gray-5">
          <span
            v-if="saving"
            class="flex items-center gap-2"
          >
            <Spinner size="sm" />
            Saving...
          </span>
          <span
            v-else-if="error"
            class="text-ink-red-5 truncate max-w-64"
            :title="error"
          >
            {{ error }}
          </span>
          <span v-else>Changes are saved automatically</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          label="Close"
          @click="isShowing = false"
        />
      </footer>
    </div>
  </SettingsDialog>
</template>

<script setup lang="ts">
import SettingsGeneralTab from '@frappe-local/renderer/components/settings/SettingsGeneralTab.vue';
import SettingsAppearanceTab from '@frappe-local/renderer/components/settings/SettingsAppearanceTab.vue';
import SettingsAdvancedTab from '@frappe-local/renderer/components/settings/SettingsAdvancedTab.vue';
import SettingsUpdatesTab from '@frappe-local/renderer/components/settings/SettingsUpdatesTab.vue';
import { Button, SettingsContent, SettingsDialog, SettingsNavGroup, SettingsNavItem, SettingsPanel, SettingsSidebar, Spinner, toast } from 'frappe-ui';
import { toastTask } from '@frappe-local/renderer/composables/ui/toastTask';
import { markRaw, computed, onMounted, reactive, ref, watch, type Component } from 'vue';

interface TabDefinition {
  label: string;
  value: string;
  icon: string;
  component: Component;
  props?: Record<string, unknown>;
  events?: Record<string, unknown>;
}

interface GroupDefinition {
  label: string;
  tabs: TabDefinition[];
}

const groups = computed<GroupDefinition[]>(() => [
  {
    label: 'User Preferences',
    tabs: [
      {
        label: 'General',
        value: 'general',
        icon: 'lucide-settings',
        component: markRaw(SettingsGeneralTab),
        props: {
          form: form.value,
          loading: loading.value,
          error: error.value,
          terminalOptions: terminalOptions.value,
          selectedTerminalOption: selectedTerminalOption.value,
        },
        events: {
          'update:selectedTerminalOption': (v: string) => (selectedTerminalOption.value = v),
          refresh,
          pickStoragePath: onPickStoragePath,
        },
      },
      {
        label: 'Appearance',
        value: 'appearance',
        icon: 'lucide-palette',
        component: markRaw(SettingsAppearanceTab),
        props: { form: form.value },
      },
      {
        label: 'Advanced',
        value: 'advanced',
        icon: 'lucide-sliders-horizontal',
        component: markRaw(SettingsAdvancedTab),
        props: {
          form: form.value,
          saving: saving.value,
          systemResources,
          isRestartingSsh: isRestartingSsh.value,
          isWindows: isWindows.value,
          systemResourcesLoaded: systemResourcesLoaded.value,
          currentMemoryMb: currentMemoryMb.value,
          memorySliderValue: memorySliderValue.value,
          memoryHasChanged: memoryHasChanged.value,
          formatMemory,
          showSshConfirmation: showSshConfirmation.value,
          validatingBrewery: validatingBrewery.value,
          breweryValidationMessage: breweryValidationMessage.value,
          breweryValidationSuccess: breweryValidationSuccess.value,
        },
        events: {
          'update:memorySliderValue': (v: number[]) => (memorySliderValue.value = v),
          'update:showSshConfirmation': (v: boolean) => (showSshConfirmation.value = v),
          useRecommendedMemory,
          applyMemory: onApplyMemory,
          confirmSshSave: onConfirmSshSave,
          cancelSshSave: onCancelSshSave,
          resetBrewery: resetToDefaultBrewery,
        },
      },
      {
        label: 'Updates',
        value: 'updates',
        icon: 'lucide-download',
        component: markRaw(SettingsUpdatesTab),
        props: {
          form: form.value,
          updateMessage: updateMessage.value,
          isUpdateAvailable: isUpdateAvailable.value,
          isCheckingForUpdates: isCheckingForUpdates.value,
          isDownloadingUpdate: isDownloadingUpdate.value,
          formattedLastChecked: formattedLastChecked.value,
        },
        events: {
          checkForUpdates: onCheckForUpdates,
          downloadUpdate: onDownloadUpdate,
        },
      },
    ],
  },
]);

const tabsList = computed(() => groups.value.flatMap((g) => g.tabs));

import type { AvailableTerminal } from '@frappe-local/shared/core';
import { useSettings } from '@frappe-local/renderer/composables/data';
import { useAppHealth, useIpc, useSshKeys } from '@frappe-local/renderer/composables/system';

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
const { health } = useAppHealth();
const isWindows = computed(() => health.value?.platform === 'win32');

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
  
  toastTask(promise, {
    loading: 'Updating memory and restarting environment',
    success: 'Memory updated and environment restarted.',
    error: (err: unknown) => `Failed to apply memory changes: ${(err as Error)?.message || err}`,
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
  if (saving.value) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => onSave(), 500);
    return;
  }

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
    if (loading.value) return;
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
