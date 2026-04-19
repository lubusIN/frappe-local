<template>
  <div class="site-filters-panel">
    <div class="site-filters-header">
      <h4 class="site-filters-title">Filter Sites</h4>
      <button v-if="hasActiveFilters" type="button" class="btn btn--subtle btn--sm" @click="$emit('clear')">
        Clear filters
      </button>
    </div>

    <div class="site-filters-controls">
      <div class="site-filter-input">
        <input
          type="text"
          class="site-filter-search"
          placeholder="Search by name…"
          :value="filterCriteria.query"
          @input="$emit('update:query', $event.target.value)"
        />
      </div>

      <select class="site-filter-select" :value="filterCriteria.groupId ?? ''" @change="$emit('update:groupId', $event.target.value || null)">
        <option value="">All groups</option>
        <option value="unassigned">Unassigned</option>
        <option v-for="group in groups" :key="group.id" :value="group.id">
          {{ group.name }}
        </option>
      </select>

      <select class="site-filter-select" :value="filterCriteria.status ?? ''" @change="$emit('update:status', $event.target.value || undefined)">
        <option value="">All statuses</option>
        <option v-for="status in filterOptions.statuses" :key="status" :value="status">
          {{ status }}
        </option>
      </select>
    </div>

    <div v-if="filterOptions.tags.length > 0" class="site-filters-tags">
      <p class="site-filters-tags-label">Tags</p>
      <div class="site-filters-tags-list">
        <label v-for="tag in filterOptions.tags" :key="tag" class="site-filter-tag">
          <input
            type="checkbox"
            :checked="selectedTags.includes(tag)"
            @change="$emit('toggle-tag', tag)"
          />
          {{ tag }}
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SiteFilterCriteria } from '../tag-filters';

interface FilterOptions {
  statuses: string[];
  tags: string[];
}

interface Group {
  id: string;
  name: string;
}

const props = defineProps<{
  filterCriteria: SiteFilterCriteria;
  selectedTags: string[];
  filterOptions: FilterOptions;
  groups: Group[];
}>();

defineEmits<{
  'update:query': [value: string];
  'update:groupId': [value: string | null];
  'update:status': [value: string | undefined];
  'toggle-tag': [tag: string];
  clear: [];
}>();

const hasActiveFilters = computed(() => {
  return !!(
    props.filterCriteria.query ||
    props.filterCriteria.groupId !== undefined ||
    props.filterCriteria.status ||
    props.selectedTags.length > 0
  );
});
</script>

<style scoped>
.site-filters-panel {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface-card);
}

.site-filters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.site-filters-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
}

.btn:hover:not(:disabled) { background: var(--surface-hover); }
.btn--subtle { border-color: var(--border-default); }
.btn--sm { min-height: 24px; padding: 0 8px; font-size: 11px; }

.site-filters-controls {
  display: grid;
  grid-template-columns: 1fr 200px 200px;
  gap: 12px;
  margin-bottom: 12px;
}

.site-filter-input {
  grid-column: 1;
}

.site-filter-search {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--surface-card);
  color: var(--text-primary);
}

.site-filter-search:focus {
  outline: none;
  border-color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--text-primary);
}

.site-filter-select {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background-color: var(--surface-card);
  color: var(--text-primary);
  cursor: pointer;
}

.site-filter-select:focus {
  outline: none;
  border-color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--text-primary);
}

.site-filters-tags {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}

.site-filters-tags-label {
  margin: 0 0 8px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.site-filters-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.site-filter-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary);
}

.site-filter-tag input {
  cursor: pointer;
  accent-color: var(--primary);
}
</style>
