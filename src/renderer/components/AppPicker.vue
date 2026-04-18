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
            :disabled="disabled"
            @change="onToggle(item.id)"
          />
          <span class="app-picker-item-name">{{ item.name }}</span>
          <span class="app-picker-item-version">v{{ item.version }}</span>
        </label>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppCatalog } from '../composables/useAppCatalog';
import { normalizeSelection, toggleAppSelection } from '../app-picker-state';

const props = defineProps<{
  modelValue: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const query = ref('');
const { state, reload } = useAppCatalog();

const items = computed(() => state.value.data ?? []);

const onSearch = () => {
  void reload(query.value);
};

const onToggle = (appId: string) => {
  const next = toggleAppSelection(props.modelValue, appId);
  emit('update:modelValue', normalizeSelection(next));
};
</script>
