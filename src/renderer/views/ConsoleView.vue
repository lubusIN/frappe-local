<template>
  <section class="catalog-view">
    <header class="catalog-header">
      <div>
        <p class="card-eyebrow">App Catalog</p>
        <h3 class="catalog-title">Discover apps</h3>
      </div>
      <div class="catalog-actions">
        <input
          v-model="query"
          class="catalog-search"
          type="search"
          placeholder="Search apps..."
          @input="onSearch"
        />
        <button type="button" class="catalog-refresh" @click="reload(query)" :disabled="state.loading">
          {{ state.loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <p v-if="state.error" class="catalog-error">{{ state.error }}</p>

    <div v-else-if="state.loading" class="catalog-empty">
      <p class="catalog-empty-title">Loading catalog…</p>
    </div>

    <div v-else-if="items.length === 0" class="catalog-empty">
      <p class="catalog-empty-title">No matching apps.</p>
      <p class="catalog-empty-body">Try a broader search term.</p>
    </div>

    <ul v-else class="catalog-grid">
      <li v-for="item in items" :key="item.id" class="catalog-card">
        <div class="catalog-card-top">
          <h4 class="catalog-name">{{ item.name }}</h4>
          <span class="catalog-version">v{{ item.version }}</span>
        </div>
        <p class="catalog-description">{{ item.description }}</p>
        <a class="catalog-source" :href="item.source" target="_blank" rel="noreferrer">{{ item.source }}</a>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppCatalog } from '../composables/useAppCatalog';

const query = ref('');
const { state, reload } = useAppCatalog();

const items = computed(() => state.value.data ?? []);

const onSearch = () => {
  void reload(query.value);
};
</script>