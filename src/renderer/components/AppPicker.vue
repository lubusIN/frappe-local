<template>
  <section class="app-picker">
    <header class="app-picker-header">
      <p class="app-picker-title">Apps</p>
      <input
        v-model="query"
        class="app-picker-search"
        type="search"
        placeholder="Search apps"
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

    <p v-if="state.error" class="app-picker-error">{{ state.error }}</p>
    <p v-else-if="state.loading" class="app-picker-empty">Loading apps…</p>
    <p v-else-if="items.length === 0" class="app-picker-empty">No matching apps.</p>

    <ul v-else class="app-picker-grid">
      <li v-for="item in items" :key="item.id" class="app-picker-item">
        <label>
          <input
            type="checkbox"
            :checked="modelValue.includes(item.id)"
            :disabled="disabled || !getCompatibility(item.id).isCompatible"
            @change="onToggle(item.id)"
          />
          <span class="app-picker-item-name">{{ item.name }}</span>
          <span class="app-picker-item-version">v{{ item.version }}</span>
          <span
            v-if="getCompatibility(item.id).status !== 'ok'"
            class="app-picker-item-compatibility"
            :class="`app-picker-item-compatibility--${getCompatibility(item.id).status}`"
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
