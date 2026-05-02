<template>
  <section class="app-picker">
    <header class="app-picker-header">
      <input
        v-model="query"
        class="app-picker-search"
        type="search"
        placeholder="Search apps…"
        :disabled="disabled"
        @input="onSearch"
      />
      <select v-model="categoryFilter" class="app-picker-filter" :disabled="disabled || state.loading">
        <option value="">All categories</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.label }}</option>
      </select>
    </header>

    <div v-if="frappeVersion" class="app-picker-version-badge">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 3.5v4a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0zM8 11.5a.75.75 0 110-1.5.75.75 0 010 1.5z"/>
      </svg>
      Showing apps compatible with <strong>{{ frappeVersionLabel }}</strong>
    </div>

    <div v-if="state.error" class="app-picker-state app-picker-state--error">{{ state.error }}</div>
    <div v-else-if="state.loading" class="app-picker-state">Loading apps…</div>
    <div v-else-if="items.length === 0" class="app-picker-state">No matching apps.</div>

    <div v-else class="app-picker-list">
      <ListView
        ref="listViewRef"
        class="app-picker-list__view"
        :columns="appColumns"
        :rows="rows"
        row-key="name"
        :options="{ selectable: true, showTooltip: false, rowHeight: '80px' }"
        @update:selections="onSelectionsChange"
      >
        <template #default="{ selectable }">
          <ListHeader class="app-picker-list__header-sticky" />
          <ListRows class="app-picker-list__rows" />
          <ListSelectBanner v-if="selectable" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'icon'">
            <div class="app-picker-item__leading">
              <img v-if="row.icon && !imageErrors[row.appId]" :src="row.icon" class="app-picker-item__icon" @error="imageErrors[row.appId] = true" />
              <div v-else class="app-picker-item__icon-fallback">{{ row.appName.charAt(0).toUpperCase() }}</div>
            </div>
          </template>
          <template v-else-if="column.key === 'name'">
            <div class="app-picker-item__body" :class="{ 'app-picker-item__body--disabled': row.disabled }">
              <div class="app-picker-item__title-row">
                <span class="app-picker-item__name">{{ row.appName }}</span>
              </div>
              <p class="app-picker-item__desc">{{ row.description }}</p>
              <div class="app-picker-item__meta">
                <span class="app-picker-item__version">v{{ row.version }}</span>
                <span class="app-picker-item__support" :class="`app-picker-item__support--${row.compatibilityStatus}`">
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
import { ListHeader, ListRows, ListSelectBanner, ListView } from 'frappe-ui';
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

<style scoped>
.app-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  height: 100%;
}

.app-picker-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 0;
}

.app-picker-search {
  flex: 1;
  min-width: 140px;
}

.app-picker-filter {
  min-width: 120px;
  font-size: 12px;
}

.app-picker-version-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
}

.app-picker-version-badge strong {
  font-weight: 600;
}

.app-picker-state {
  padding: 12px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
}

.app-picker-state--error {
  color: var(--red-text);
}

.app-picker-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding-right: 0;
  margin-bottom: 8px;
}

.app-picker-list__view {
  min-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.app-picker :deep(.relative.flex.w-full.flex-1.flex-col.overflow-x-auto) {
  height: 100%;
  min-height: 0;
}

.app-picker-list__header-sticky {
  position: sticky;
  top: 0;
  z-index: 3;
}

.app-picker-list__rows {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.app-picker :deep(.grid.items-center.gap-4.px-2) {
  gap: 12px;
  padding-left: 0;
  padding-right: 0;
}

.app-picker :deep(.w-fit.pe-2.py-3.flex) {
  width: 24px;
  padding-inline-end: 0;
  justify-content: center;
}

.app-picker :deep(.text-sm.text-ink-gray-5) {
  font-size: 12px;
}

.app-picker :deep(.overflow-x-hidden) {
  overflow: visible;
}

.app-picker :deep(input[type='checkbox']) {
  min-height: 0;
  padding: 0;
}

.app-picker-item__leading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
}

.app-picker-item__body {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.app-picker-item__body--disabled {
  opacity: 0.65;
}

.app-picker-item__icon,
.app-picker-item__icon-fallback {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: cover;
}

.app-picker-item__icon-fallback {
  background: var(--surface-hover, #f0f0f0);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.app-picker-item__title-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

.app-picker-item__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-picker-item__desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.app-picker-item__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.app-picker-item__version,
.app-picker-item__support {
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.app-picker-item__version {
  color: var(--text-muted);
}

.app-picker-item__support {
  color: var(--text-secondary);
}

.app-picker-item__support--warning {
  color: var(--orange-text);
}

.app-picker-item__support--blocked {
  color: var(--red-text);
}

</style>
