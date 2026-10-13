<template>
  <section class="flex h-full min-h-0 w-80 sm:w-96 shrink-0 flex-col border-r border-outline-gray-1 bg-surface-base">
    <div
      v-if="!error && sites.length > 0"
      class="flex items-center gap-2 shrink-0 border-b border-outline-gray-1 px-4 py-2 bg-surface-base w-full min-w-0"
    >
      <div class="flex-1 min-w-0">
        <FormControl
          v-model="filters.search"
          type="text"
          placeholder="Search sites..."
          size="sm"
          variant="outline"
        >
          <template #prefix>
            <span
              class="lucide-search w-4 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </FormControl>
      </div>
      <div class="w-36 shrink-0">
        <FormControl
          v-model="filterSelection"
          type="select"
          :options="benchFilterOptions"
          size="sm"
          variant="outline"
        >
          <template #prefix>
            <span
              class="lucide-list-filter w-4 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </FormControl>
      </div>
    </div>
    <ScrollArea
      class="min-h-0 flex-1"
      viewport-class="p-1"
    >
      <StatePanel
        v-if="error"
        kind="error"
        title="Unable to load sites"
        :body="error"
        action-label="Retry"
        @action="$emit('refresh')"
      />
      <div
        v-else-if="!loading && !benchLoading && allBenches.length === 0"
        class="p-3"
      >
        <FirstRunGuide
          title="Create a bench first"
          body="Sites live on bench, create one to get started."
          :links="siteSetupLinks"
          compact
        />
      </div>
      <StatePanel
        v-else-if="loading && sites.length === 0"
        kind="loading"
        title="Loading sites"
        body="Fetching sites and status metadata."
      />
      <div
        v-else-if="sites.length === 0"
        class="p-3"
      >
        <EmptyState
          title="No sites yet"
          description="Create your first site to manage runtime status, inspect logs, and access dashboards."
          :icon="'lucide-app-window'"
        >
          <div class="mt-4">
            <Button
              v-if="creatableBenches.length > 0"
              size="sm"
              variant="solid"
              @click="$emit('create')"
            >
              Create site
            </Button>
            <Button
              v-else
              size="sm"
              variant="subtle"
              @click="$router.push('/benches')"
            >
              Go to Benches
            </Button>
          </div>
        </EmptyState>
      </div>
      <div
        v-else-if="filteredSites.length === 0"
        class="p-3"
      >
        <EmptyState
          title="No matching sites"
          description="No sites match the current bench, status, or search filters."
          :icon="'lucide-search'"
        >
          <Button
            size="sm"
            variant="subtle"
            class="mt-2"
            @click="clearFilters"
          >
            Clear filters
          </Button>
        </EmptyState>
      </div>
      <template v-else>
        <List
          :active="modelValue"
          :columns="['minmax(0,1fr)', 'auto']"
          :style="{ '--list-row-padding-x': '1rem' }"
          @update:active="$emit('update:modelValue', $event)"
        >
          <ListRows
            v-slot="{ item: site, value }"
            :items="filteredSites"
            row-key="id"
          >
            <ListRow
              :value="value"
              class="group"
              @click="$emit('select', site.id)"
            >
              <ListCell>
                <div class="min-w-0 py-3">
                  <div
                    class="truncate inline-flex items-center text-sm text-ink-gray-8"
                    :class="modelValue === site.id && 'font-semibold text-ink-gray-9'"
                  >
                    <span
                      class="mr-2 inline-block size-2 rounded-full align-middle shrink-0"
                      :class="site.status === 'ready' ? (isBenchRunning(site.benchId) ? 'bg-surface-green-7' : 'bg-surface-gray-5') : site.status === 'queued' ? 'bg-surface-yellow-7 animate-pulse' : 'bg-surface-red-7'"
                    />
                    <span class="truncate">{{ site.name }}</span>
                  </div>
                  <div class="truncate text-xs text-ink-gray-5 mt-0.5 pl-4">
                    {{ getBenchName(site.benchId) }}
                  </div>
                </div>
              </ListCell>
              <ListCell class="self-center justify-end">
                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    v-if="isResourceBusy(site.id)"
                    class="inline-block size-3 rounded-full border-[1.5px] border-ink-gray-6 border-r-transparent animate-spin"
                  />
                  <Button
                    v-if="isBenchRunning(site.benchId)"
                    variant="ghost"
                    :icon="'lucide-external-link'"
                    class="!size-7 transition-opacity"
                    :class="[modelValue === site.id ? 'text-ink-gray-9 opacity-100' : 'text-ink-gray-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink-gray-9']"
                    tooltip="Open in Browser"
                    :disabled="!isBenchRunning(site.benchId) || updating || isResourceBusy(site.id) || (site.status !== 'ready' && site.status !== 'failure')"
                    @click.stop="$emit('openExternal', site.id)"
                  />
                </div>
              </ListCell>
            </ListRow>
          </ListRows>
        </List>
      </template>
    </ScrollArea>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Button, FormControl, ScrollArea } from 'frappe-ui';
import { List, ListCell, ListRow, ListRows } from 'frappe-ui/list';
import FirstRunGuide, { type FirstRunGuideLink } from '@frappe-local/renderer/components/FirstRunGuide.vue';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import { filterSites } from '@frappe-local/renderer/utils/sites';
import type { SiteListItem, BenchListItem } from '@frappe-local/shared/core';

const props = defineProps<{
  modelValue: string | undefined;
  sites: SiteListItem[];
  allBenches: BenchListItem[];
  loading: boolean;
  benchLoading: boolean;
  updating: boolean;
  error: string | null;
  isResourceBusy: (id: string) => boolean;
}>();

defineEmits(['update:modelValue', 'select', 'refresh', 'create', 'openExternal']);

const SELECT_ALL = '__all__';

const siteSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Go to Benches', to: '/benches' },
  { label: 'Review runtime', to: '/diagnostics' },
]);

const filters = reactive({ benchId: '', search: '' });

const benchFilterOptions = computed(() => [
  { label: 'All benches', value: SELECT_ALL },
  ...props.allBenches.map((bench) => ({ label: bench.name, value: bench.id })),
]);

const filterSelection = computed({
  get: () => filters.benchId || SELECT_ALL,
  set: (value: string) => { filters.benchId = value === SELECT_ALL ? '' : value; },
});

const filteredSites = computed(() => filterSites(props.sites, filters));

const clearFilters = () => {
  filters.benchId = '';
  filters.search = '';
};

const getBenchName = (id: string) => {
  const bench = props.allBenches.find((b) => b.id === id);
  return bench ? bench.name : id;
};

const isBenchRunning = (benchId: string) => {
  return props.allBenches.find((b) => b.id === benchId)?.status === 'running';
};

const creatableBenches = computed(() => props.allBenches.filter((bench) => bench.status === 'running' || bench.status === 'success'));

defineExpose({ filteredSites });
</script>
