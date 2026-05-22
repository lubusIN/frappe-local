<template>
  <section class="flex flex-col h-full gap-1">
    <header class="flex items-center gap-2.5 mb-3">
      <div class="min-w-[140px] flex-1">
        <TextInput 
          v-model="query"
          type="search"
          placeholder="Search apps…"
          :disabled="disabled"
          variant="outline"
          @update:model-value="onSearch"
        >
          <template #prefix>
            <IconSearch class="w-4 text-ink-gray-6" />
          </template>
        </TextInput>
      </div>
      <Select
        v-model="categoryFilter"
        class="min-w-[120px] text-xs"
        :disabled="disabled || state.loading"
        :options="categoryOptions"
        variant="outline"
      />
    </header>

    <div
      v-if="state.error"
      class="px-2 py-3 text-xs text-center text-ink-red-4"
    >
      {{ state.error }}
    </div>
    <div
      v-else-if="state.loading"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      Loading apps…
    </div>
    <div
      v-else-if="items.length === 0"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      No matching apps.
    </div>

    <div
      v-else
      class="flex-1 min-h-0 mb-2 overflow-hidden"
    >
      <ListView
        ref="listViewRef"
        class="h-[50vh]"
        :columns="appColumns"
        :rows="rows"
        row-key="name"
        :options="{
          selectable: false,
          showTooltip: false,
          rowHeight: '80px',
          emptyState: {
            title: 'No Apps',
            description: 'No apps found in the catalog.',
          },
        }"
      >
        <template #default>
          <ListRows class="flex-1 min-h-0 pr-1 overflow-y-auto" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'icon'">
            <div class="flex items-center justify-start w-12">
              <img
                v-if="row.icon && !imageErrors[row.appId]"
                :src="row.icon"
                class="object-cover w-12 h-12 rounded-lg"
                @error="imageErrors[row.appId] = true"
              >
              <div
                v-else
                class="flex items-center justify-center w-6 h-6 text-sm font-semibold rounded bg-surface-gray-3 text-ink-gray-5"
              >
                {{ row.appName.charAt(0).toUpperCase() }}
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'name'">
            <div
              class="grid min-w-0 gap-1"
              :class="{ 'opacity-60': row.disabled }"
            >
              <div class="flex items-center min-w-0">
                <span class="text-sm font-semibold truncate text-ink-gray-9">{{ row.appName }}</span>
              </div>
              <p class="m-0 text-xs leading-snug text-wrap text-ink-gray-6">
                {{ row.description }}
              </p>
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-[10px] font-medium text-ink-gray-5">{{ row.version }}</span>
                <span
                  class="text-[10px] font-medium"
                  :class="{
                    'text-ink-amber-3': row.compatibilityStatus === 'warning',
                    'text-ink-red-4': row.compatibilityStatus === 'blocked',
                    'text-ink-gray-6': row.compatibilityStatus !== 'warning' && row.compatibilityStatus !== 'blocked',
                  }"
                >
                  {{ row.supportText }}
                </span>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="flex items-center justify-end h-full pr-1 text-right">
              <template v-if="row.appId === 'frappe'">
                <Badge
                  theme="gray"
                  variant="subtle"
                  size="sm"
                >
                  Core App
                </Badge>
              </template>
              <template v-else-if="context === 'bench'">
                <Button
                  v-if="row.isActive"
                  variant="subtle"
                  theme="red"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                  :loading="loadingAppId === row.appId"
                  @click="emit('remove-app', row.appId)"
                >
                  Remove
                </Button>
                <Button
                  v-else
                  variant="subtle"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                  :loading="loadingAppId === row.appId"
                  @click="emit('add-app', row.appId)"
                >
                  Add
                </Button>
              </template>
              <template v-else-if="context === 'site'">
                <Button
                  v-if="row.isActive"
                  variant="subtle"
                  theme="red"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                  :loading="loadingAppId === row.appId"
                  @click="emit('uninstall-app', row.appId)"
                >
                  Uninstall
                </Button>
                <Button
                  v-else
                  variant="subtle"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                  :loading="loadingAppId === row.appId"
                  @click="emit('install-app', row.appId)"
                >
                  Install
                </Button>
              </template>
            </div>
          </template>
        </template>
      </ListView>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import IconSearch from '~icons/lucide/search';
import { Badge, Button, ListRows, ListView, Select, TextInput } from 'frappe-ui';
import type { CatalogAppItem } from '../../shared/ipc';
import { useAppCatalogFilters } from '../composables/useAppCatalogFilters';

const appColumns = [
  { key: 'icon', label: '', width: '46px' },
  { key: 'name', label: 'Name', width: 'minmax(70%, 450px)' },
  { key: 'actions', label: '', width: '120px' },
];

const props = defineProps<{
  context: 'bench' | 'site';
  activeAppIds: readonly string[];
  allowedAppIds?: readonly string[];
  disabled?: boolean;
  frappeVersion?: string;
  loadingAppId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'add-app', appId: string): void;
  (e: 'remove-app', appId: string): void;
  (e: 'install-app', appId: string): void;
  (e: 'uninstall-app', appId: string): void;
}>();

const frappeVersionRef = computed(() => props.frappeVersion);

const {
  query,
  categoryFilter,
  state,
  categoryOptions,
  items,
  evaluateCompatibility,
  onSearch,
} = useAppCatalogFilters({ frappeVersion: frappeVersionRef });

const imageErrors = ref<Record<string, boolean>>({});

const allowedAppIds = computed(() => {
  if (!props.allowedAppIds || props.allowedAppIds.length === 0) {
    return null;
  }

  return new Set(props.allowedAppIds.map((appId) => appId.trim()).filter(Boolean));
});

const visibleItems = computed(() =>
  items.value.filter((item) => {
    if (allowedAppIds.value && !allowedAppIds.value.has(item.id)) {
      return false;
    }

    // Filter out incompatible apps
    const compatibility = evaluateCompatibility(item as CatalogAppItem);
    if (!compatibility.isCompatible) {
      return false;
    }

    return true;
  })
);

const rows = computed(() =>
  visibleItems.value.map((item) => {
    const isActive = props.activeAppIds.includes(item.id) || (props.context === 'site' && item.id === 'frappe');
    const compatibility = evaluateCompatibility(item as CatalogAppItem);

    return {
      ...item,
      appId: item.id,
      appName: item.name,
      name: item.id,
      disabled: props.disabled,
      isActive,
      compatibilityStatus: compatibility.status,
      supportText:
        compatibility.status === 'ok'
          ? ''
          : compatibility.message,
    };
  })
);

</script>
