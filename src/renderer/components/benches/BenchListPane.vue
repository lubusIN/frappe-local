<template>
  <section class="flex h-full min-h-0 w-80 sm:w-96 shrink-0 flex-col border-r border-outline-gray-1 bg-surface-base">
    <div
      v-if="!error && benches.length > 0"
      class="flex items-center gap-2 shrink-0 border-b border-outline-gray-1 px-4 py-2 bg-surface-base w-full min-w-0"
    >
      <div class="flex-1 min-w-0">
        <FormControl
          v-model="filters.search"
          type="text"
          placeholder="Search benches..."
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
          :options="statusTabOptions"
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
        title="Unable to load benches"
        :body="error"
        action-label="Retry"
        @action="$emit('refresh')"
      />
      <StatePanel
        v-else-if="loading && benches.length === 0"
        kind="loading"
        title="Loading benches"
        body="Fetching benches and lifecycle metadata."
      />
      <div
        v-else-if="benches.length === 0"
        class="p-3"
      >
        <EmptyState
          title="No benches yet"
          description="Create your first bench to get started with Frappe applications and sites."
          :icon="'lucide-boxes'"
        >
          <div class="mt-4">
            <Button
              size="sm"
              variant="solid"
              @click="$emit('create')"
            >
              Create bench
            </Button>
          </div>
        </EmptyState>
      </div>
      <div
        v-else-if="filteredBenches.length === 0"
        class="p-3"
      >
        <EmptyState
          title="No matching benches"
          description="No benches match the current status or search filters."
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
            v-slot="{ item: bench, value }"
            :items="filteredBenches"
            row-key="id"
          >
            <ListRow
              :value="value"
              @click="$emit('select', bench.id)"
            >
              <ListCell>
                <div class="min-w-0 py-3">
                  <div
                    class="truncate inline-flex items-center text-sm text-ink-gray-8"
                    :class="modelValue === bench.id && 'font-semibold text-ink-gray-9'"
                  >
                    <span
                      class="mr-2 inline-block size-2 rounded-full align-middle shrink-0"
                      :class="bench.status === 'running' ? 'bg-surface-green-7' : (bench.status === 'stopped' || bench.status === 'success') ? 'bg-surface-gray-5' : bench.status === 'queued' ? 'bg-surface-yellow-7 animate-pulse' : 'bg-surface-red-7'"
                    />
                    <span class="truncate">{{ bench.name }}</span>
                  </div>
                  <div
                    class="truncate text-xs text-ink-gray-5 mt-0.5 pl-4"
                    :title="bench.path"
                  >
                    {{ formatPath(bench.path) }}
                  </div>
                </div>
              </ListCell>
              <ListCell class="self-start justify-end pt-3.5">
                <div class="flex items-center gap-1.5 shrink-0">
                  <Spinner
                    v-if="isResourceBusy(bench.id)"
                    size="xs"
                    class="text-ink-gray-6"
                  />
                  <span
                    v-else-if="bench.frappeVersion"
                    class="text-xs font-mono text-ink-gray-5"
                  >{{ bench.frappeVersion }}</span>
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
import { Button, FormControl, ScrollArea, Spinner } from 'frappe-ui';
import { List, ListCell, ListRow, ListRows } from 'frappe-ui/list';
import StatePanel from '@frappe-local/renderer/components/ui/StatePanel.vue';
import EmptyState from '@frappe-local/renderer/components/ui/EmptyState.vue';
import type { BenchListItem } from '@frappe-local/shared/core';

const props = defineProps<{
  modelValue: string | undefined;
  benches: BenchListItem[];
  loading: boolean;
  error: string | null;
  isResourceBusy: (id: string) => boolean;
}>();

defineEmits(['update:modelValue', 'select', 'refresh', 'create']);

const filters = reactive({ status: '', search: '' });
const SELECT_ALL = '__all__';

const statusTabOptions = computed(() => [
  { label: 'All statuses', value: SELECT_ALL },
  { label: 'Running', value: 'running' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Error', value: 'failure' },
]);

const filterSelection = computed({
  get: () => filters.status || SELECT_ALL,
  set: (value: string) => { filters.status = value === SELECT_ALL ? '' : value; },
});

const filteredBenches = computed(() => {
  return props.benches.filter((bench) => {
    if (filters.status) {
      if (filters.status === 'running' && bench.status !== 'running') return false;
      if (filters.status === 'stopped' && bench.status !== 'stopped' && bench.status !== 'success') return false;
      if (filters.status === 'failure' && bench.status !== 'failure') return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return bench.name.toLowerCase().includes(q) || bench.path.toLowerCase().includes(q) || (bench.frappeVersion || '').toLowerCase().includes(q);
    }
    return true;
  });
});

const clearFilters = () => {
  filters.status = '';
  filters.search = '';
};

const formatPath = (path: string) => {
  if (!path) return '';
  return path.replace(/^\/Users\/[^/]+/, '~');
};

defineExpose({ filteredBenches });
</script>
