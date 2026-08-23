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
            variant="outline"
            size="md"
            icon-left="lucide-eraser"
            label="Clean Cache"
            class="!justify-start w-full"
            :disabled="!isBenchRunning || updating || deleting || isBusy"
            @click="$emit('cleanCache')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-database"
            label="Migrate"
            class="!justify-start w-full"
            :disabled="!isBenchRunning || updating || deleting || isBusy"
            @click="$emit('migrate')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-activity"
            label="Task Logs"
            class="!justify-start w-full"
            @click="$emit('logs')"
          />
          <Button
            v-if="site.status === 'failure'"
            variant="outline"
            size="md"
            icon-left="lucide-rotate-ccw"
            label="Reset Status"
            class="!justify-start w-full"
            :disabled="!isBenchRunning || updating || isBusy"
            @click="$emit('resetStatus')"
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
            v-if="isBenchRunning"
            variant="outline"
            size="md"
            icon-left="lucide-external-link"
            label="Browser"
            class="!justify-start w-full"
            :disabled="!isBenchRunning || updating || isBusy || (site.status !== 'ready' && site.status !== 'failure')"
            @click="$emit('openExternal')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-folder-open"
            label="Folder"
            class="!justify-start w-full"
            @click="$emit('openFolder')"
          />
          <Button
            variant="outline"
            size="md"
            icon-left="lucide-terminal"
            label="Terminal"
            class="!justify-start w-full"
            :disabled="!isBenchRunning || isBusy || (site.status !== 'ready' && site.status !== 'failure')"
            @click="$emit('openShell')"
          />
        </div>
      </div>

      <!-- Installed Apps Section -->
      <InstalledAppsSection
        :app-ids="site.apps || []"
        :bench-id="site.benchId"
        :bench-status="benchStatus"
        context="site"
        @remove-app="$emit('removeApp', $event)"
      />
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { Button, ScrollArea } from 'frappe-ui';
import InstalledAppsSection from '@frappe-local/renderer/components/InstalledAppsSection.vue';
import type { SiteListItem } from '@frappe-local/shared/core';

defineProps<{
  site: SiteListItem;
  isBenchRunning: boolean;
  benchStatus: string | undefined;
  updating: boolean;
  deleting: boolean;
  isBusy: boolean;
}>();

defineEmits(['cleanCache', 'migrate', 'logs', 'resetStatus', 'openExternal', 'openFolder', 'openShell', 'removeApp']);
</script>
