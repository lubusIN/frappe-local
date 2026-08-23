<template>
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
            :model-value="formData.breweryUrl"
            type="text"
            placeholder="https://frappe-brewery.lubus.in/"
            class="flex-1"
            :disabled="saving || validatingBrewery"
            @update:model-value="formData.breweryUrl = $event"
          />
          <Button
            variant="outline"
            size="sm"
            :disabled="!formData.breweryUrl || formData.breweryUrl === DEFAULT_BREWERY_URL || saving || validatingBrewery"
            @click="$emit('resetBrewery')"
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
          :model-value="formData.shareSshKeys"
          size="sm"
          :disabled="saving || isRestartingSsh"
          @update:model-value="formData.shareSshKeys = $event"
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
          <span class="shrink-0 rounded-5 border border-outline-gray-2 bg-surface-base px-2.5 py-1 text-sm-semibold text-ink-gray-8">
            {{ formatMemory(currentMemoryMb) }}
          </span>
        </SettingsRow>

        <div class="mt-2">
          <Slider
            :model-value="memorySliderValue"
            class="cursor-pointer [&_[role=slider]]:cursor-pointer"
            :disabled="saving"
            :min="MIN_PODMAN_MEMORY_MB"
            :max="systemResources.totalMemoryMb"
            :step="1024"
            @update:model-value="$emit('update:memorySliderValue', $event)"
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
              {{ isWindows
                ? 'Applies globally to WSL2 and restarts all running WSL distributions.'
                : 'Applying a memory change will restart environment.' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              size="sm"
              variant="subtle"
              class="shrink-0"
              :disabled="saving"
              @click="$emit('useRecommendedMemory')"
            >
              Use recommended
            </Button>
            <Button
              v-if="memoryHasChanged"
              size="sm"
              variant="solid"
              :loading="saving"
              @click="$emit('applyMemory')"
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { Button, FormControl, Switch, Slider, SettingsHeader, SettingsBody, SettingsRow } from 'frappe-ui';
import type { Settings } from '@frappe-local/shared/domain';
import { MIN_PODMAN_MEMORY_MB, DEFAULT_BREWERY_URL } from '@frappe-local/shared/domain';

const props = defineProps<{
  form: Settings;
  saving: boolean;
  systemResources: {
    totalMemoryMb: number;
    recommendedPodmanMemoryMb: number;
    podmanMachineRequired: boolean;
  };
  isRestartingSsh: boolean;
  isWindows: boolean;
  systemResourcesLoaded: boolean;
  currentMemoryMb: number;
  memorySliderValue: number[];
  memoryHasChanged: boolean;
  formatMemory: (val: number) => string;
  showSshConfirmation: boolean;
  validatingBrewery: boolean;
  breweryValidationMessage: string;
  breweryValidationSuccess: boolean;
}>();

defineEmits([
  'update:memorySliderValue',
  'update:showSshConfirmation',
  'useRecommendedMemory',
  'applyMemory',
  'confirmSshSave',
  'cancelSshSave',
  'resetBrewery'
]);

const formData = props.form;
</script>