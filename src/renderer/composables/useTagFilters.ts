import { computed, ref } from 'vue';
import type { Site } from '../../shared/domain/models';
import { filterSites, getFilterOptions } from '../tag-filters';
import type { SiteFilterCriteria } from '../tag-filters';

export function useTagFilters(sites: { value: Site[] }, workspaces: { value: any[] }) {
  const filterCriteria = ref<SiteFilterCriteria>({
    query: '',
    groupId: undefined,
    status: undefined,
  });

  const selectedTags = ref<string[]>([]);

  // Build map of groupId -> tags from workspaces
  const groupTagMap = computed(() => {
    const map = new Map<string, string[]>();
    workspaces.value.forEach((ws) => {
      map.set(ws.id, ws.tags);
    });
    return map;
  });

  // Get filtered sites
  const filteredSites = computed(() => {
    const criteria: SiteFilterCriteria = {
      ...filterCriteria.value,
      tags: selectedTags.value.length > 0 ? selectedTags.value : undefined,
    };
    return filterSites(sites.value, criteria, groupTagMap.value);
  });

  // Get available filter options
  const filterOptions = computed(() => getFilterOptions(sites.value, groupTagMap.value));

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    const index = selectedTags.value.indexOf(tag);
    if (index > -1) {
      selectedTags.value.splice(index, 1);
    } else {
      selectedTags.value.push(tag);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    filterCriteria.value = {
      query: '',
      groupId: undefined,
      status: undefined,
    };
    selectedTags.value = [];
  };

  return {
    filterCriteria,
    selectedTags,
    groupTagMap,
    filteredSites,
    filterOptions,
    toggleTag,
    clearFilters,
  };
}
