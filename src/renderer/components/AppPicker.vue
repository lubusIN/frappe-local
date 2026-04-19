<template>
  <section class="app-picker">
    <header class="app-picker-header">
      <p class="app-picker-title">Apps Reference</p>
      <input
        v-model="query"
        class="app-picker-search"
        type="search"
        placeholder="Search available apps…"
        :disabled="disabled"
        @input="onSearch"
      />
      <select v-model="sourceHost" class="app-picker-filter" :disabled="disabled || state.loading">
        <option value="">All sources</option>
        <option v-for="host in sourceHosts" :key="host" :value="host">{{ host }}</option>
      </select>
      <select v-model="sort" class="app-picker-filter" :disabled="disabled || state.loading">
        <option value="name-asc">Name A-Z</option>
        <option value="name-desc">Name Z-A</option>
        <option value="version-desc">Newest version</option>
      </select>
    </header>

    <div v-if="state.error" class="app-picker-state app-picker-state--error">{{ state.error }}</div>
    <div v-else-if="state.loading" class="app-picker-state">Loading apps…</div>
    <div v-else-if="items.length === 0" class="app-picker-state">No matching apps.</div>

    <ul v-else class="app-picker-grid">
      <li v-for="item in items" :key="item.id" class="app-picker-item">
        <label class="app-picker-item__label">
          <input
            type="checkbox"
            :checked="modelValue.includes(item.id)"
            :disabled="disabled || !getCompatibility(item.id).isCompatible"
            @change="onToggle(item.id)"
          />
          <div class="app-picker-item__content">
            <span class="app-picker-item__name">{{ item.name }}</span>
            <span class="app-picker-item__version">v{{ item.version }}</span>
          </div>
          <span
            v-if="getCompatibility(item.id).status !== 'ok'"
            class="app-picker-item__compatibility"
            :class="`app-picker-item__compatibility--${getCompatibility(item.id).status}`"
          >
            {{ getCompatibility(item.id).message }}
          </span>
        </label>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CatalogAppItem } from '../../shared/ipc';
import { useAppCatalog } from '../composables/useAppCatalog';
import { normalizeSelection, toggleAppSelection } from '../app-picker-state';
import { filterAndSortCatalog, getCatalogSourceHosts, type CatalogSort } from '../catalog-query';
import { evaluateCatalogCompatibility } from '../catalog-compatibility';

const props = defineProps<{
  modelValue: string[];
  disabled?: boolean;
  runtime?: 'docker' | 'podman';
  frappeVersion?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const query = ref('');
const sourceHost = ref('');
const sort = ref<CatalogSort>('name-asc');
const { state, reload } = useAppCatalog();

const sourceHosts = computed(() => getCatalogSourceHosts(state.value.data ?? []));

const items = computed(() =>
  filterAndSortCatalog(state.value.data ?? [], {
    query: query.value,
    sourceHost: sourceHost.value,
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
    runtime: props.runtime,
    frappeVersion: props.frappeVersion,
  });
};
</script>

<style scoped>
.app-picker {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-bg);
}

.app-picker-header {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.app-picker-title {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: none; /* Hide visually but keep if needed */
}

.app-picker-search {
  flex: 1;
  min-width: 140px;
}

.app-picker-filter {
  min-width: 120px;
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

.app-picker-grid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  border-radius: 6px;
}

.app-picker-item__label {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: border-color 100ms ease;
}

.app-picker-item__label:hover {
  border-color: var(--border-default);
}

.app-picker-item__content {
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
  font-size: 12px;
  color: var(--text-muted);
}

.app-picker-item__compatibility {
  font-size: 11px;
  font-weight: 500;
}

.app-picker-item__compatibility--warning {
  color: var(--orange-text);
}

.app-picker-item__compatibility--blocked {
  color: var(--red-text);
}
</style>
