<template>
  <section class="flex h-full flex-col gap-1">
    <header class="flex items-center gap-2.5">
      <div class="min-w-[140px] flex-1">
        <TextInput
          v-model="query"
          type="search"
          placeholder="Search apps…"
          :disabled="disabled"
          variant="outline"
          @update:model-value="onSearch"
        />
      </div>
      <Select
        v-model="categoryFilter"
        class="min-w-[120px] text-xs"
        :disabled="disabled || state.loading"
        :options="categoryOptions"
        variant="outline"
      />
    </header>

    <Badge
      v-if="frappeVersion"
      variant="subtle"
      theme="blue"
      class="inline-flex w-fit items-center gap-1.5"
    >
      <IconInfo class="h-3 w-3" />
      Showing apps compatible with <strong>{{ frappeVersionLabel }}</strong>
    </Badge>

    <div
      v-if="state.error"
      class="px-2 py-3 text-center text-xs text-ink-red-4"
    >
      {{ state.error }}
    </div>
    <div
      v-else-if="state.loading"
      class="px-2 py-3 text-center text-xs text-ink-gray-6"
    >
      Loading apps…
    </div>
    <div
      v-else-if="items.length === 0"
      class="px-2 py-3 text-center text-xs text-ink-gray-6"
    >
      No matching apps.
    </div>

    <div
      v-else
      class="mb-2 min-h-0 flex-1 overflow-hidden"
    >
      <ListView
        ref="listViewRef"
        class="flex h-full min-h-0 min-w-full flex-col"
        :columns="appColumns"
        :rows="rows"
        row-key="name"
        :options="{
          selectable: true,
          showTooltip: false,
          rowHeight: '80px',
          emptyState: {
            title: 'No Apps',
            description: 'No apps found in the catalog.',
          },
        }"
        @update:selections="onSelectionsChange"
      >
        <template #default="{ selectable }">
          <ListHeader class="sticky top-0 z-[3]" />
          <ListRows class="min-h-0 flex-1 overflow-y-auto pr-1" />
          <ListSelectBanner v-if="selectable" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'icon'">
            <div class="flex w-10 items-center justify-center">
              <img
                v-if="row.icon && !imageErrors[row.appId]"
                :src="row.icon"
                class="h-6 w-6 rounded object-cover"
                @error="imageErrors[row.appId] = true"
              >
              <div
                v-else
                class="flex h-6 w-6 items-center justify-center rounded bg-surface-gray-3 text-sm font-semibold text-ink-gray-5"
              >
                {{ row.appName.charAt(0).toUpperCase() }}
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'name'">
            <div
              class="grid min-w-0 gap-1"
              :class="{ 'opacity-60': row.disabled }"
            >
              <div class="flex min-w-0 items-center">
                <span class="truncate text-sm font-semibold text-ink-gray-9">{{ row.appName }}</span>
              </div>
              <p class="m-0 truncate text-xs leading-snug text-ink-gray-6">
                {{ row.description }}
              </p>
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-[10px] font-medium text-ink-gray-5">v{{ row.version }}</span>
                <span
                  class="text-[10px] font-medium"
                  :class="{
                    'text-ink-amber-3': row.compatibilityStatus === 'warning',
                    'text-ink-red-4': row.compatibilityStatus === 'blocked',
                    'text-ink-gray-6': row.compatibilityStatus !== 'warning' && row.compatibilityStatus !== 'blocked',
                  }"
                >
                  {{ row.supportText }}
                </span>
              </div>
            </div>
          </template>
        </template>
      </ListView>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Badge, ListHeader, ListRows, ListSelectBanner, ListView, Select, TextInput } from 'frappe-ui';
import IconInfo from '~icons/lucide/info';
import type { CatalogAppItem } from '../../shared/ipc';
import { useAppCatalog } from '../composables/useAppCatalog';
import { normalizeSelection } from '../app-picker-state';
import { filterAndSortCatalog, getCatalogCategories, type CatalogSort } from '../catalog-query';
import { evaluateCatalogCompatibility } from '../catalog-compatibility';

const appColumns = [
  { key: 'icon', label: '', width: '40px' },
  { key: 'name', label: 'Name', width: 'minmax(0, 1fr)' },
];

const props = defineProps<{
  modelValue: string[];
  disabled?: boolean;
  frappeVersion?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const query = ref('');
const categoryFilter = ref('');
const sort = ref<CatalogSort>('name-asc');
const { state, reload } = useAppCatalog();
const imageErrors = ref<Record<string, boolean>>({});
const listViewRef = ref<{ selections: Set<string> } | null>(null);
const syncingFromUser = ref(false);
const syncingFromModel = ref(false);

const frappeVersionLabel = computed(() => {
  const v = props.frappeVersion ?? '';
  if (v.startsWith('version-')) return `Frappe ${v.replace('version-', 'v')}`;
  if (v === 'develop') return 'Frappe develop';
  return `Frappe ${v}`;
});

const categories = computed(() => getCatalogCategories(state.value.data ?? []));
const categoryOptions = computed(() => [
  { label: 'All categories', value: '' },
  ...categories.value.map((category) => ({ label: category.label, value: category.id })),
]);

const items = computed(() =>
  filterAndSortCatalog(state.value.data ?? [], {
    query: query.value,
    sourceHost: '',
    category: categoryFilter.value,
    sort: sort.value,
  })
);

const rows = computed(() =>
  items.value.map((item) => {
    const compatibility = evaluateCatalogCompatibility(item as CatalogAppItem, {
      frappeVersion: props.frappeVersion,
    });

    return {
      ...item,
      appId: item.id,
      appName: item.name,
      name: item.id,
      disabled: props.disabled || !compatibility.isCompatible,
      compatibilityStatus: compatibility.status,
      supportText:
        compatibility.status === 'ok'
          ? props.frappeVersion
            ? `Compatible with ${frappeVersionLabel.value}`
            : 'Supported'
          : compatibility.message,
    };
  })
);

const onSearch = () => {
  void reload(query.value);
};

const syncSelectionsFromModel = () => {
  const selectionSet = listViewRef.value?.selections;
  if (!selectionSet) return;

  syncingFromModel.value = true;
  selectionSet.clear();
  rows.value.forEach((row) => {
    if (!row.disabled && props.modelValue.includes(row.appId)) {
      selectionSet.add(row.name);
    }
  });
  nextTick(() => { syncingFromModel.value = false; });
};

const onSelectionsChange = (value: Set<string>) => {
  if (syncingFromModel.value) return;
  syncingFromUser.value = true;
  emit('update:modelValue', normalizeSelection(Array.from(value)));
  nextTick(() => { syncingFromUser.value = false; });
};

watch([() => props.modelValue, rows], () => {
  if (syncingFromUser.value) return;
  syncSelectionsFromModel();
}, { immediate: true });
</script>
