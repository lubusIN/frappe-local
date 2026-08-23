<template>
  <ScrollArea class="h-full">
    <div class="space-y-8 px-6 py-5 w-full max-w-3xl">
      <!-- Manage Section -->
      <div class="flex flex-col gap-3">
        <h3 class="text-base-semibold text-ink-gray-9">
          Manage
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          <Button
            v-if="bench.status !== 'running'"
            variant="outline"
            size="md"
            icon-left="lucide-play"
            label="Start"
            class="!justify-start w-full"
            :disabled="updating || isBusy || bench.status === 'queued'"
            @click="$emit('start')"
          />
          <Button
            v-else
            variant="outline"
            size="md"
            icon-left="lucide-rotate-cw"
            label="Restart"
            class="!justify-start w-full"
            :disabled="updating || isBusy"
            @click="$emit('restart')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-square"
            label="Stop"
            class="!justify-start w-full"
            :disabled="updating || bench.status === 'stopped' || bench.status === 'queued' || isBusy"
            @click="$emit('stop')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-hammer"
            label="Build"
            class="!justify-start w-full"
            :disabled="updating || deleting || bench.status !== 'running' || isBusy"
            @click="$emit('build')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-activity"
            label="Task Logs"
            class="!justify-start w-full"
            @click="$emit('logs')"
          />
        </div>
      </div>

      <!-- Open in Section -->
      <div class="flex flex-col gap-3">
        <h3 class="text-base-semibold text-ink-gray-9">
          Open in
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          <Button
            v-if="health?.platform !== 'win32'"
            variant="outline"
            size="md"
            icon-left="lucide-folder-open"
            label="Folder"
            class="!justify-start w-full"
            :disabled="openingFolder"
            @click="$emit('openFolder')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-terminal"
            label="Terminal"
            class="!justify-start w-full"
            :disabled="bench.status !== 'running'"
            @click="$emit('openShell')"
          />
          <Button
            v-if="health?.platform !== 'win32'"
            variant="outline"
            size="md"
            icon-left="lucide-code"
            label="VS Code"
            class="!justify-start w-full"
            :disabled="!isEditorInstalled"
            @click="$emit('openEditor', false)"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-box"
            :label="health?.platform === 'win32' ? 'VS Code' : 'Dev Container'"
            class="!justify-start w-full"
            :disabled="!isEditorInstalled || bench.status !== 'running'"
            @click="$emit('openEditor', true)"
          />
        </div>
      </div>

      <!-- Installed Apps Section -->
      <InstalledAppsSection
        :app-ids="bench.apps || []"
        :bench-id="bench.id"
        :bench-status="bench.status"
        context="bench"
        @remove-app="$emit('removeApp', $event)"
      />
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { Button, ScrollArea } from 'frappe-ui';
import InstalledAppsSection from '@frappe-local/renderer/components/InstalledAppsSection.vue';
import type { BenchListItem, AppHealthResponse } from '@frappe-local/shared/core';

defineProps<{
  bench: BenchListItem;
  health: AppHealthResponse | null;
  updating: boolean;
  deleting: boolean;
  openingFolder: boolean;
  isEditorInstalled: boolean;
  isBusy: boolean;
}>();

defineEmits(['start', 'restart', 'stop', 'build', 'logs', 'openFolder', 'openShell', 'openEditor', 'removeApp']);
</script>
