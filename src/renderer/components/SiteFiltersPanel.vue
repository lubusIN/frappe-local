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
  border: 1px solid #e4e9ef;
  border-radius: 12px;
  padding: 14px;
  background: #ffffff;
}

.site-filters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.site-filters-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f272e;
}

.site-filters-clear {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  background: #f8fafc;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  color: #334155;
  cursor: pointer;
}

.site-filters-clear:hover {
  background: #eef3f8;
  border-color: #cfd9e6;
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
  border: 1px solid #d7dee8;
  border-radius: 8px;
  font-size: 14px;
}

.site-filter-select {
  padding: 8px 12px;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  font-size: 14px;
  background-color: #ffffff;
  cursor: pointer;
}

.site-filters-tags {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e4e9ef;
}

.site-filters-tags-label {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
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
  color: #334155;
}

.site-filter-tag input {
  cursor: pointer;
  width: 16px;
  height: 16px;
}
</style>
