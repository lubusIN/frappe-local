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
          selectable: mode === 'select',
          showTooltip: false,
          rowHeight: '80px',
          emptyState: {
            title: 'No Apps',
            description: 'No apps found in the catalog.',
          },
        }"
        @update:selections="onSelectionsChange"
      >
        <template #default="{ selectable }">
          <ListHeader
            v-if="selectable"
            class="sticky top-0 z-[3]"
          />
          <ListRows class="flex-1 min-h-0 pr-1 overflow-y-auto" />
          <ListSelectBanner v-if="selectable" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'details'">
            <div
              class="flex min-w-0 items-center gap-4"
              :class="{ 'opacity-60': row.disabled }"
            >
              <img
                v-if="row.icon && !imageErrors[row.appId]"
                :src="row.icon"
                class="size-12 shrink-0 rounded-lg object-cover"
                @error="imageErrors[row.appId] = true"
              >
              <div
                v-else
                class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-gray-3 text-sm font-semibold text-ink-gray-5"
              >
                {{ row.appName.charAt(0).toUpperCase() }}
              </div>

              <div class="grid min-w-0 flex-1 gap-1">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm font-semibold text-ink-gray-9">{{ row.appName }}</span>
                  <Badge
                    v-if="mode === 'select' && row.isPreinstalledCoreApp"
                    theme="gray"
                    variant="subtle"
                    size="sm"
                  >
                    Pre-bundled
                  </Badge>
                </div>
                <p class="m-0 text-wrap text-xs leading-snug text-ink-gray-6">
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
                  Get
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
import { computed, nextTick, ref, watch } from 'vue';
import IconSearch from '~icons/lucide/search';
import { Badge, Button, ListHeader, ListRows, ListSelectBanner, ListView, Select, TextInput } from 'frappe-ui';
import type { CatalogAppItem } from '../../shared/core/ipc';
import { CORE_BENCH_APPS_SET } from '../../shared/utils/bench-apps';
import { normalizeSelection } from '../controllers/app-picker';
import { useAppCatalogFilters } from '../composables/data/useAppCatalogFilters';

const props = withDefaults(
  defineProps<{
    mode: 'select' | 'manage';

    // common
    disabled?: boolean;
    frappeVersion?: string;
    allowedAppIds?: readonly string[];
    
    // select mode
    modelValue?: string[];
    disableCoreBenchApps?: boolean;
    disabledAppIds?: readonly string[];
    excludeAppIds?: readonly string[];

    // manage mode
    context?: 'bench' | 'site';
    activeAppIds?: readonly string[];
    loadingAppId?: string | null;
  }>(),
  {
    disabled: false,
    disableCoreBenchApps: false,
    modelValue: () => [],
    disabledAppIds: () => [],
    excludeAppIds: () => [],
    activeAppIds: () => [],
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
  (e: 'add-app', appId: string): void;
  (e: 'remove-app', appId: string): void;
  (e: 'install-app', appId: string): void;
  (e: 'uninstall-app', appId: string): void;
}>();

const appColumns = computed(() => {
  if (props.mode === 'select') {
    return [
      { key: 'details', label: 'App', width: 'minmax(0, 1fr)' },
    ];
  }
  return [
    { key: 'details', label: 'App', width: 'minmax(0, 1fr)' },
    { key: 'actions', label: '', width: '120px' },
  ];
});

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
const listViewRef = ref<{ selections: Set<string> } | null>(null);
const syncingFromUser = ref(false);
const syncingFromModel = ref(false);

const excludedAppIds = computed(() => new Set((props.excludeAppIds ?? []).map((appId) => appId.trim()).filter(Boolean)));
const disabledAppIds = computed(() => new Set((props.disabledAppIds ?? []).map((appId) => appId.trim()).filter(Boolean)));
const allowedAppIds = computed(() => {
  if (!props.allowedAppIds || props.allowedAppIds.length === 0) {
    return null;
  }
  return new Set(props.allowedAppIds.map((appId) => appId.trim()).filter(Boolean));
});

const visibleItems = computed(() =>
  items.value.filter((item) => {
    if (props.mode === 'select' && excludedAppIds.value.has(item.id)) {
      return false;
    }

    if (allowedAppIds.value && !allowedAppIds.value.has(item.id)) {
      return false;
    }

    const compatibility = evaluateCompatibility(item as CatalogAppItem);
    if (!compatibility.isCompatible) {
      return false;
    }

    return true;
  })
);

const rows = computed(() =>
  visibleItems.value.map((item) => {
    const compatibility = evaluateCompatibility(item as CatalogAppItem);

    if (props.mode === 'manage') {
      const isActive = props.activeAppIds.includes(item.id) || (props.context === 'site' && item.id === 'frappe');
      return {
        ...item,
        appId: item.id,
        appName: item.name,
        name: item.id,
        disabled: props.disabled,
        isActive,
        compatibilityStatus: compatibility.status,
        supportText: compatibility.status === 'ok' ? '' : compatibility.message,
      };
    }

    // select mode
    const isPreinstalledCoreApp = Boolean(props.disableCoreBenchApps && CORE_BENCH_APPS_SET.has(item.id));
    const isExplicitlyDisabled = disabledAppIds.value.has(item.id);

    return {
      ...item,
      appId: item.id,
      appName: item.name,
      name: item.id,
      disabled: props.disabled || isPreinstalledCoreApp || isExplicitlyDisabled,
      compatibilityStatus: compatibility.status,
      isPreinstalledCoreApp,
      supportText:
        isExplicitlyDisabled
          ? 'Already active and installed'
          : compatibility.status === 'ok'
          ? ''
          : compatibility.message,
    };
  })
);

const syncSelectionsFromModel = () => {
  if (props.mode !== 'select') return;
  const selectionSet = listViewRef.value?.selections;
  if (!selectionSet) return;

  syncingFromModel.value = true;
  selectionSet.clear();
  rows.value.forEach((row) => {
    if (!row.disabled && props.modelValue.includes(row.appId)) {
      selectionSet.add(row.name);
    }
  });
  nextTick(() => { syncingFromModel.value = false; });
};

const onSelectionsChange = (value: Set<string>) => {
  if (props.mode !== 'select' || syncingFromModel.value) return;
  syncingFromUser.value = true;
  emit('update:modelValue', normalizeSelection(Array.from(value)));
  nextTick(() => { syncingFromUser.value = false; });
};

watch([() => props.modelValue, rows], () => {
  if (props.mode !== 'select' || syncingFromUser.value) return;
  syncSelectionsFromModel();
}, { immediate: true });
</script>
