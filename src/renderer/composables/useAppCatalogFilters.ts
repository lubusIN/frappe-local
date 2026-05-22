import { computed, ref, type Ref } from 'vue';
import type { CatalogAppItem } from '../../shared/ipc';
import { useAppCatalog } from './useAppCatalog';
import { filterAndSortCatalog, getCatalogCategories, type CatalogSort } from '../catalog-query';
import { evaluateCatalogCompatibility } from '../catalog-compatibility';

export function useAppCatalogFilters(options?: { frappeVersion?: Ref<string | undefined> }) {
  const query = ref('');
  const categoryFilter = ref('');
  const sort = ref<CatalogSort>('name-asc');
  const { state, reload } = useAppCatalog();

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

  const evaluateCompatibility = (item: CatalogAppItem) => {
    return evaluateCatalogCompatibility(item, {
      frappeVersion: options?.frappeVersion?.value,
    });
  };

  const onSearch = () => {
    void reload(query.value);
  };

  return {
    query,
    categoryFilter,
    sort,
    state,
    categoryOptions,
    items,
    evaluateCompatibility,
    onSearch,
    reload,
  };
}
