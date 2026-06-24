<template>
  <section class="overflow-hidden rounded-lg border border-outline-gray-2 bg-surface-base">
    <div class="flex items-center justify-between gap-3 border-b border-outline-gray-2 bg-surface-gray-2 px-4 py-3.5">
      <div>
        <h3 class="m-0 text-[13px] font-semibold text-ink-gray-9">
          Update Strategy
        </h3>
        <p class="mt-0.5 text-xs text-ink-gray-6">
          Release channel policy
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          variant="subtle"
          :disabled="loading || checking"
          @click="$emit('check')"
        >
          {{ checking ? 'Checking…' : 'Check for updates' }}
        </Button>
      </div>
    </div>

    <div class="grid gap-4 p-4">
      <StatePanel
        v-if="error"
        kind="error"
        title="Unable to load update strategy"
        :body="error"
        action-label="Retry"
        @action="$emit('refresh')"
      />

      <StatePanel
        v-else-if="loading"
        kind="loading"
        title="Loading update policy"
        body="Reading release channel policy and update safeguards."
      />

      <StatePanel
        v-else-if="!status"
        kind="empty"
        title="No update policy"
        body="Refresh to load update strategy status."
      />

      <template v-else>
        <div class="grid gap-3 rounded-md border border-outline-gray-2 bg-surface-gray-2 p-3.5">
          <p class="m-0 text-[13px] text-ink-gray-9">
            {{ status.summary }}
          </p>
          <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
            <div class="flex flex-col gap-0.5 text-xs">
              <span class="text-ink-gray-6">Current version</span><strong class="font-medium text-ink-gray-9">{{ status.currentVersion }}</strong>
            </div>
            <div class="flex flex-col gap-0.5 text-xs">
              <span class="text-ink-gray-6">Channel</span><strong class="font-medium text-ink-gray-9">{{ status.channel }}</strong>
            </div>
            <div class="flex flex-col gap-0.5 text-xs">
              <span class="text-ink-gray-6">Mode</span><strong class="font-medium text-ink-gray-9">{{ status.mode }}</strong>
            </div>
            <div class="flex flex-col gap-0.5 text-xs">
              <span class="text-ink-gray-6">Auto update</span><strong class="font-medium text-ink-gray-9">{{ status.autoUpdateEnabled ? 'Enabled' : 'Disabled' }}</strong>
            </div>
          </div>
        </div>

        <div
          v-if="lastCheck"
          class="grid gap-1.5 rounded-md border border-outline-gray-2 p-3"
        >
          <div class="flex items-center justify-between text-[13px] text-ink-gray-9">
            <strong>Last Update Check</strong>
            <Badge
              variant="subtle"
              :theme="lastCheckTheme"
            >
              {{ lastCheck.status }}
            </Badge>
          </div>
          <p class="m-0 text-[13px] text-ink-gray-6">
            {{ lastCheck.message }}
          </p>
          <p class="m-0 text-[11px] text-ink-gray-5">
            Checked at {{ lastCheck.checkedAt }}
          </p>
        </div>

        <div
          v-if="status.rollbackGuidance.length > 0"
          class="border-t border-dashed border-outline-gray-2 pt-3"
        >
          <h4 class="m-0 mb-2 text-xs-semibold uppercase text-ink-gray-6">
            Rollback Guidance
          </h4>
          <ul class="m-0 grid list-disc gap-1 pl-5 text-[13px] text-ink-gray-6">
            <li
              v-for="step in status.rollbackGuidance"
              :key="step"
            >
              {{ step }}
            </li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Badge, Button } from 'frappe-ui';
import type { UpdateCheckResult, UpdateStrategyStatus } from '@frappe-local/shared/core/ipc';
import { computed } from 'vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';

const props = defineProps<{
  status: UpdateStrategyStatus | null;
  lastCheck: UpdateCheckResult | null;
  loading: boolean;
  checking: boolean;
  error: string | null;
}>();

defineEmits<{
  refresh: [];
  check: [];
}>();

const lastCheckTheme = computed<'gray' | 'blue' | 'green' | 'red' | 'amber'>(() => {
  if (props.lastCheck?.status === 'not-configured') return 'gray';
  return 'gray';
});
</script>
