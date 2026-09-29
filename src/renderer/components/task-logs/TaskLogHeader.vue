<template>
  <div class="flex flex-wrap items-center justify-between border-b border-outline-gray-2 px-4 py-2.5 gap-3 bg-surface-gray-1">
    <div class="flex items-center gap-2">
      <span class="text-xs-medium text-ink-gray-7">
        {{ stepCount }} {{ stepCount === 1 ? 'step' : 'steps' }}
      </span>
      <span class="text-ink-gray-3">•</span>
      <span class="text-xs text-ink-gray-5">
        {{ entryCountLabel }}
      </span>
    </div>

    <div class="flex items-center gap-2 flex-1 justify-end min-w-[220px]">
      <div class="w-64 max-w-full">
        <FormControl
          :model-value="searchQuery"
          type="text"
          placeholder="Search logs…"
          variant="outline"
          @update:model-value="$emit('update:searchQuery', $event)"
        >
          <template #prefix>
            <span
              class="lucide-search w-3.5 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </FormControl>
      </div>
      <Button
        size="sm"
        variant="subtle"
        @click="$emit('toggleExpandAll')"
      >
        {{ allExpanded ? 'Collapse all' : 'Expand all' }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FormControl, Button } from 'frappe-ui';

defineProps<{
  stepCount: number;
  entryCountLabel: string;
  searchQuery: string;
  allExpanded: boolean;
}>();

defineEmits(['update:searchQuery', 'toggleExpandAll']);
</script>
