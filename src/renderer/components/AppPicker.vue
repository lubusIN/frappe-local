<template>
  <section class="flex flex-col h-full gap-1">
    <header class="flex items-center gap-2.5 mb-3">
      <div class="min-w-[140px] flex-1">
        <TextInput 
          v-model="query"
          type="search"
          placeholder="Search apps…"
          :disabled="disabled"
          variant="outline"
          @update:model-value="onSearch"
        >
          <template #prefix>
            <IconSearch class="w-4 text-ink-gray-6" />
          </template>
        </TextInput>
      </div>
      <Select
        v-model="categoryFilter"
        class="min-w-[120px] text-xs"
        :disabled="disabled || state.loading"
        :options="categoryOptions"
        variant="outline"
      />
    </header>

    <div
      v-if="state.error"
      class="px-2 py-3 text-xs text-center text-ink-red-4"
    >
      {{ state.error }}
    </div>
    <div
      v-else-if="state.loading"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      Loading apps…
    </div>
    <div
      v-else-if="items.length === 0"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      No matching apps.
    </div>

    <div
      v-else
      class="flex-1 min-h-0 mb-2 overflow-hidden"
    >
      <ListView
        ref="listViewRef"
        class="h-[50vh]"
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
          <ListRows class="flex-1 min-h-0 pr-1 overflow-y-auto" />
          <ListSelectBanner v-if="selectable" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'icon'">
            <div class="flex items-center justify-start w-12">
              <img
                v-if="row.icon && !imageErrors[row.appId]"
                :src="row.icon"
                class="object-cover w-12 h-12 rounded-lg"
                @error="imageErrors[row.appId] = true"
              >
              <div
                v-else
                class="flex items-center justify-center w-6 h-6 text-sm font-semibold rounded bg-surface-gray-3 text-ink-gray-5"
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
              <div class="flex items-center min-w-0">
                <span class="text-sm font-semibold truncate text-ink-gray-9">{{ row.appName }}</span>
              </div>
              <p class="m-0 text-xs leading-snug text-wrap text-ink-gray-6">
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
import IconSearch from '~icons/lucide/search';
import { ListHeader, ListRows, ListSelectBanner, ListView, Select, TextInput } from 'frappe-ui';
import type { CatalogAppItem } from '../../shared/ipc';
import { CORE_BENCH_APPS_SET } from '../../shared/bench-apps';
import { useAppCatalog } from '../composables/useAppCatalog';
import { normalizeSelection } from '../app-picker-state';
import { filterAndSortCatalog, getCatalogCategories, type CatalogSort } from '../catalog-query';
import { evaluateCatalogCompatibility } from '../catalog-compatibility';

const appColumns = [
  { key: 'icon', label: '', width: '46px' },
  { key: 'name', label: 'Name', width: 'minmax(85%, 500px)' },
];

const props = defineProps<{
  modelValue: string[];
  disabled?: boolean;
  frappeVersion?: string;
  disableCoreBenchApps?: boolean;
  excludeAppIds?: readonly string[];
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

const excludedAppIds = computed(() => new Set((props.excludeAppIds ?? []).map((appId) => appId.trim()).filter(Boolean)));

const items = computed(() =>
  filterAndSortCatalog(state.value.data ?? [], {
    query: query.value,
    sourceHost: '',
    category: categoryFilter.value,
    sort: sort.value,
  })
);

const visibleItems = computed(() => items.value.filter((item) => !excludedAppIds.value.has(item.id)));

const rows = computed(() =>
  visibleItems.value.map((item) => {
    const isPreinstalledCoreApp = Boolean(props.disableCoreBenchApps && CORE_BENCH_APPS_SET.has(item.id));
    const compatibility = evaluateCatalogCompatibility(item as CatalogAppItem, {
      frappeVersion: props.frappeVersion,
    });

    return {
      ...item,
      appId: item.id,
      appName: item.name,
      name: item.id,
      disabled: props.disabled || isPreinstalledCoreApp || !compatibility.isCompatible,
      compatibilityStatus: compatibility.status,
      supportText:
        isPreinstalledCoreApp
          ? 'Preinstalled with bench'
          : compatibility.status === 'ok'
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
