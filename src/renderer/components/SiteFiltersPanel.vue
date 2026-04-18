<template>
  <div class="site-filters-panel">
    <div class="site-filters-header">
      <h4 class="site-filters-title">Filter Sites</h4>
      <button v-if="hasActiveFilters" type="button" class="site-filters-clear" @click="$emit('clear')">
        Clear filters
      </button>
    </div>

    <div class="site-filters-controls">
      <div class="site-filter-input">
        <input
          type="text"
          class="site-filter-search"
          placeholder="Search by name..."
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
import type { SiteFilterCriteria } from '../tag-filters';

interface FilterOptions {
  statuses: string[];
  tags: string[];
}

defineProps<{
  filterCriteria: SiteFilterCriteria;
  selectedTags: string[];
  filterOptions: FilterOptions;
  groups: any[];
}>();

defineEmits<{
  'update:query': [value: string];
  'update:groupId': [value: string | null];
  'update:status': [value: string | undefined];
  'toggle-tag': [tag: string];
  clear: [];
}>();

const hasActiveFilters = () => {
  return !!(
    filterCriteria.query ||
    filterCriteria.groupId !== undefined ||
    filterCriteria.status ||
    selectedTags.length > 0
  );
};
</script>

<style scoped>
.site-filters-panel {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  background: #fafafa;
}

.site-filters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.site-filters-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.site-filters-clear {
  padding: 4px 8px;
  font-size: 12px;
  background: none;
  border: none;
  color: #6f4f36;
  cursor: pointer;
  text-decoration: underline;
}

.site-filters-clear:hover {
  color: #8f2e2e;
}

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
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 14px;
}

.site-filter-select {
  padding: 8px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;
  cursor: pointer;
}

.site-filters-tags {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.site-filters-tags-label {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
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
  color: #333;
}

.site-filter-tag input {
  cursor: pointer;
  width: 16px;
  height: 16px;
}
</style>
