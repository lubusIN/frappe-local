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
      <ul class="app-picker-grid">
        <li v-for="item in items" :key="item.id" class="app-picker-item" :class="{ 'app-picker-item--blocked': !getCompatibility(item.id).isCompatible }">
          <label class="app-picker-item__label">
            <input
              type="checkbox"
              class="app-picker-item__checkbox"
              :checked="modelValue.includes(item.id)"
              :disabled="disabled || !getCompatibility(item.id).isCompatible"
              @change="onToggle(item.id)"
            />
            <img 
              v-if="item.icon && !imageErrors[item.id]" 
              :src="item.icon" 
              class="app-picker-item__icon" 
              @error="imageErrors[item.id] = true" 
            />
            <div v-else class="app-picker-item__icon-fallback">{{ item.name.charAt(0).toUpperCase() }}</div>
            <div class="app-picker-item__content">
              <div class="app-picker-item__header">
                <span class="app-picker-item__name">{{ item.name }}</span>
                <span class="app-picker-item__version">v{{ item.version }}</span>
              </div>
              <p class="app-picker-item__desc">{{ item.description }}</p>
            </div>
            <span
              v-if="getCompatibility(item.id).status !== 'ok'"
              class="app-picker-item__badge"
              :class="`app-picker-item__badge--${getCompatibility(item.id).status}`"
            >
              {{ getCompatibility(item.id).message }}
            </span>
          </label>
        </li>
      </ul>
    </div>

    <div v-if="modelValue.length > 0" class="app-picker-selection-summary">
      {{ modelValue.length }} app{{ modelValue.length !== 1 ? 's' : '' }} selected
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CatalogAppItem } from '../../shared/ipc';
import { useAppCatalog } from '../composables/useAppCatalog';
import { normalizeSelection, toggleAppSelection } from '../app-picker-state';
import { filterAndSortCatalog, getCatalogCategories, groupCatalogByCategory, type CatalogSort } from '../catalog-query';
import { evaluateCatalogCompatibility } from '../catalog-compatibility';

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



const onSearch = () => {
  void reload(query.value);
};

const onToggle = (appId: string) => {
  const next = toggleAppSelection(props.modelValue, appId);
  emit('update:modelValue', normalizeSelection(next));
};

const getCompatibility = (appId: string) => {
  const item = items.value.find((entry) => entry.id === appId);
  if (!item) {
    return {
      isCompatible: false,
      status: 'blocked' as const,
      message: 'Unknown app',
    };
  }

  return evaluateCatalogCompatibility(item as CatalogAppItem, {
    frappeVersion: props.frappeVersion,
  });
};
</script>

<style scoped>
.app-picker {
  display: grid;
  gap: 12px;
}

.app-picker-header {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.app-picker-search {
  flex: 1;
  min-width: 160px;
}

.app-picker-filter {
  min-width: 140px;
}

.app-picker-version-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--blue-text, #1a6ddb);
  background: var(--blue-light, #eef4ff);
  border: 1px solid var(--blue-border, #c2d9f5);
  border-radius: 6px;
}

.app-picker-version-badge strong {
  font-weight: 600;
}

.app-picker-state {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--surface-card);
  border: 1px dashed var(--border-light);
  border-radius: 6px;
}

.app-picker-state--error {
  color: var(--red-text);
  border-color: var(--red-border);
  background: var(--red-light);
}

.app-picker-list {
  max-height: 380px;
  overflow-y: auto;
  padding-right: 4px;
}

.app-picker-grid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.app-picker-item {
  border-bottom: 1px solid var(--border-light);
}

.app-picker-item:last-child {
  border-bottom: none;
}

.app-picker-item__label {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  background: transparent;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.app-picker-item__label:hover {
  background: var(--surface-hover, var(--surface-card));
}

.app-picker-item--blocked .app-picker-item__label {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-picker-item__checkbox {
  margin-top: 0;
}

.app-picker-item__icon,
.app-picker-item__icon-fallback {
  width: 28px;
  height: 28px;
  border-radius: 6px;
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

.app-picker-item__content {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.app-picker-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-picker-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.app-picker-item__version {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
}

.app-picker-item__desc {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.app-picker-item__badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  align-self: center;
}

.app-picker-item__badge--warning {
  color: var(--orange-text);
  background: var(--orange-light, rgba(255, 165, 0, 0.1));
}

.app-picker-item__badge--blocked {
  color: var(--red-text);
  background: var(--red-light);
}

.app-picker-selection-summary {
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary, #4a90d9);
  padding: 6px 0;
  border-top: 1px solid var(--border-light);
}
</style>
