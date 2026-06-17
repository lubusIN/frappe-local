<template>
  <ListView
    class="min-w-full"
    :columns="safeColumns"
    :rows="safeRows"
    :row-key="rowKey"
    :options="listOptions"
  >
    <template #cell="slotProps">
      <div class="py-2">
        <slot
          name="cell"
          v-bind="slotProps"
        />
      </div>
    </template>
  </ListView>
</template>

<script setup lang="ts">
import { ListView } from 'frappe-ui';
import { computed } from 'vue';

const props = defineProps<{
  columns?: object[];
  rows?: object[];
  rowKey: string;
  emptyTitle: string;
  emptyDescription: string;
  onRowClick?: (row: object) => void;
}>();

const safeColumns = computed(() => props.columns ?? []);
const safeRows = computed(() => props.rows ?? []);

const listOptions = computed(() => ({
  selectable: false,
  showTooltip: true,
  resizeColumn: true,
  rowHeight: 'auto',
  onRowClick: props.onRowClick ?? null,
  emptyState: {
    title: props.emptyTitle,
    description: props.emptyDescription,
  },
}));
</script>
