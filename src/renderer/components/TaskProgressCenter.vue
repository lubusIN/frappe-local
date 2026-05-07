<template>
  <section
    class="grid gap-4"
    aria-live="polite"
  >
    <div class="flex flex-wrap items-center gap-3 max-[760px]:flex-col max-[760px]:items-start">
      <div class="flex items-center gap-2">
        <label class="text-[13px] text-ink-gray-6">Status</label>
        <Select
          v-model="statusFilterModel"
          class="min-w-[120px]"
          :options="statusOptions"
          variant="outline"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-[13px] text-ink-gray-6">Resource</label>
        <Select
          v-model="resourceFilterModel"
          class="min-w-[120px]"
          :options="resourceOptions"
          variant="outline"
        />
      </div>
      <Switch
        v-model="recentOnlyModel"
        class="text-[13px] text-ink-gray-6"
        label="Recent 24h"
      />
    </div>

    <p
      v-if="loading"
      class="m-0 rounded-lg border border-outline-gray-2 bg-surface-white p-6 text-center text-[13px] text-ink-gray-6"
    >
      Subscribing to task stream…
    </p>
    <ErrorNotice
      v-else-if="errorNotice"
      :notice="errorNotice"
      tone="warning"
      @action="$emit('retrySubscription')"
    />
    <p
      v-else-if="items.length === 0"
      class="m-0 rounded-lg border border-outline-gray-2 bg-surface-white p-6 text-center text-[13px] text-ink-gray-6"
    >
      No matching tasks yet.
    </p>

    <div
      v-else
      class="grid gap-3"
    >
      <div
        v-for="item in items"
        :key="item.taskId"
        class="flex flex-col overflow-hidden rounded-lg border border-outline-gray-2 bg-surface-white"
      >
        <div class="flex items-center justify-between border-b border-outline-gray-2 bg-surface-gray-2 px-4 py-3">
          <div class="flex items-center gap-2">
            <Badge
              variant="subtle"
              :theme="statusTheme(item.status)"
            >
              {{ item.status }}
            </Badge>
            <Badge
              variant="outline"
              theme="gray"
            >
              {{ item.resource }}
            </Badge>
          </div>
          <time
            class="text-xs text-ink-gray-5"
            :datetime="item.timestamp"
          >{{ formatTime(item.timestamp) }}</time>
        </div>
        <div class="grid gap-1 px-4 py-4">
          <p class="m-0 text-sm font-semibold text-ink-gray-9">
            {{ item.taskName }}
          </p>
          <p class="m-0 text-[13px] leading-relaxed text-ink-gray-6">
            {{ item.message }}
          </p>
        </div>
        <div class="flex justify-end border-t border-outline-gray-2 px-4 py-2.5">
          <RouterLink
            class="text-xs font-medium text-ink-blue-3 no-underline hover:underline"
            :to="taskRoute(item)"
          >
            Open context &rarr;
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Badge, Select, Switch } from 'frappe-ui';
import type { RouteLocationRaw } from 'vue-router';
import ErrorNotice from './ErrorNotice.vue';
import { buildErrorRemediationNotice } from '../error-remediation';
import type { ProgressTaskResource, ProgressTaskSummary } from '../progress-center';

const props = defineProps<{
  items: ProgressTaskSummary[];
  loading: boolean;
  error: string | null;
  statusFilter: 'all' | 'queued' | 'running' | 'success' | 'failure';
  resourceFilter: 'all' | ProgressTaskResource;
  recentOnly: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:statusFilter', value: 'all' | 'queued' | 'running' | 'success' | 'failure'): void;
  (event: 'update:resourceFilter', value: 'all' | ProgressTaskResource): void;
  (event: 'update:recentOnly', value: boolean): void;
  (event: 'retrySubscription'): void;
}>();

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Queued', value: 'queued' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
];

const resourceOptions = [
  { label: 'All', value: 'all' },
  { label: 'Bench', value: 'bench' },
  { label: 'Site', value: 'site' },
  { label: 'Runtime', value: 'runtime' },
  { label: 'System', value: 'system' },
];

const statusFilterModel = computed({
  get: () => props.statusFilter,
  set: (value: string) => emit('update:statusFilter', value as typeof props.statusFilter),
});

const resourceFilterModel = computed({
  get: () => props.resourceFilter,
  set: (value: string) => emit('update:resourceFilter', value as typeof props.resourceFilter),
});

const recentOnlyModel = computed({
  get: () => props.recentOnly,
  set: (value: boolean) => emit('update:recentOnly', value),
});

const statusTheme = (status: string) => {
  if (status === 'running') return 'blue';
  if (status === 'success') return 'green';
  if (status === 'failure') return 'red';
  return 'gray';
};

const taskRoute = (item: ProgressTaskSummary): RouteLocationRaw => {
  if (item.resource === 'bench') {
    return item.resourceId
      ? { path: '/benches', query: { benchId: item.resourceId } }
      : { path: '/benches' };
  }

  if (item.resource === 'site') {
    return item.resourceId
      ? { path: '/sites', query: { siteId: item.resourceId } }
      : { path: '/sites' };
  }

  if (item.resource === 'runtime') {
    return { path: '/dashboard', query: item.resourceId ? { runtime: item.resourceId } : {} };
  }

  return { path: '/dashboard' };
};

const formatTime = (value: string): string => new Date(value).toLocaleString();

const errorNotice = computed(() =>
  props.error ? buildErrorRemediationNotice('progress-center', props.error) : null
);
</script>
