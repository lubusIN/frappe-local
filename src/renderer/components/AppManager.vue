<template>
  <section class="flex flex-col h-[60vh] gap-1">
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
      class="flex-1 min-h-0 mb-2 overflow-y-auto"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4 px-1">
        <div
          v-for="row in rows"
          :key="row.appId"
          class="flex flex-col relative bg-white border rounded-xl p-4 transition-all duration-200 h-[190px]"
          :class="[
            row.disabled ? 'opacity-60 cursor-not-allowed border-outline-gray-2' : 'border-outline-gray-2 hover:border-outline-gray-4',
            mode === 'select' && !row.disabled ? 'cursor-pointer' : '',
            mode === 'select' && isSelected(row.appId) ? 'ring-2 ring-surface-gray-7 border-transparent' : ''
          ]"
          @click="onCardClick(row)"
        >
          <!-- Header: Icon & Verified Badge -->
          <div class="flex items-start justify-between mb-3">
            <img
              v-if="row.icon && !imageErrors[row.appId]"
              :src="row.icon"
              class="w-10 h-10 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-outline-gray-2"
              @error="imageErrors[row.appId] = true"
            >
            <div
              v-else
              class="flex w-10 h-10 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2 text-sm font-semibold text-ink-gray-5 shadow-sm ring-1 ring-outline-gray-2"
            >
              {{ row.appName.charAt(0).toUpperCase() }}
            </div>

            <!-- Top Right area -->
            <div class="flex items-center gap-2">
              <Badge
                v-if="mode === 'select' && row.isPreinstalledCoreApp"
                theme="gray"
                variant="subtle"
              >
                Pre-bundled
              </Badge>
              <Badge
                v-if="row.verified"
                theme="green"
                variant="subtle"
                class="flex items-center gap-1"
              >
                <IconCheck class="w-3 h-3" />
                Verified
              </Badge>
              <!-- Action Buttons for Manage Mode -->
              <template v-if="mode === 'manage'">
                <template v-if="row.appId === 'frappe'">
                  <Badge theme="gray" variant="subtle">Core App</Badge>
                </template>
                <template v-else-if="context === 'bench'">
                  <Button
                    v-if="row.isActive"
                    variant="subtle"
                    theme="red"
                    size="sm"
                    :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                    :loading="loadingAppId === row.appId"
                    @click.stop="emit('remove-app', row.appId)"
                  >
                    Remove
                  </Button>
                  <Button
                    v-else
                    variant="subtle"
                    size="sm"
                    :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                    :loading="loadingAppId === row.appId"
                    @click.stop="emit('add-app', row.appId)"
                  >
                    Get
                  </Button>
                </template>
                <template v-else-if="context === 'site'">
                  <Button
                    v-if="row.isActive"
                    variant="subtle"
                    theme="red"
                    size="sm"
                    :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                    :loading="loadingAppId === row.appId"
                    @click.stop="emit('uninstall-app', row.appId)"
                  >
                    Uninstall
                  </Button>
                  <Button
                    v-else
                    variant="subtle"
                    size="sm"
                    :disabled="disabled || (loadingAppId !== null && loadingAppId !== row.appId)"
                    :loading="loadingAppId === row.appId"
                    @click.stop="emit('install-app', row.appId)"
                  >
                    Install
                  </Button>
                </template>
              </template>
            </div>
          </div>

          <!-- Title & Description -->
          <div class="flex flex-col min-h-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="text-sm font-semibold text-ink-gray-9 truncate">
                {{ row.appName }}
              </h3>
            </div>
            <p class="text-xs text-ink-gray-5 leading-relaxed line-clamp-2" :title="row.description">
              {{ row.description }}
            </p>
            
            <div v-if="row.supportText" class="mt-1">
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

          <!-- Divider removed as requested -->

          <!-- Footer: Categories & Actions/License -->
          <div class="flex items-center justify-between shrink-0 mt-auto">
            <!-- Categories -->
            <div class="flex items-center gap-1.5 flex-wrap overflow-hidden h-5">
              <span
                v-for="(cat, i) in (row.categories || []).slice(0, 2)"
                :key="i"
                class="px-2 py-0.5 rounded-full bg-surface-gray-2 text-ink-gray-6 text-[10px] font-medium whitespace-nowrap"
              >
                {{ cat }}
              </span>
              <span v-if="(row.categories || []).length > 2" class="text-ink-gray-4 text-[10px] px-1 font-medium">
                +{{ row.categories.length - 2 }}
              </span>
            </div>

            <!-- Bottom Right -->
            <div class="flex items-center gap-2 shrink-0">
               <span class="text-[10px] uppercase text-ink-gray-4 font-medium tracking-wide">
                 {{ row.license || 'Unknown' }}
               </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import IconSearch from '~icons/lucide/search';
import IconCheck from '~icons/lucide/check';
import { Badge, Button, Select, TextInput } from 'frappe-ui';
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

// Selection State for custom cards
const selectedAppIds = ref<Set<string>>(new Set());

const isSelected = (appId: string) => selectedAppIds.value.has(appId);

const onCardClick = (row: any) => {
  if (props.mode !== 'select' || row.disabled) return;
  
  const newSet = new Set(selectedAppIds.value);
  if (newSet.has(row.appId)) {
    newSet.delete(row.appId);
  } else {
    newSet.add(row.appId);
  }
  selectedAppIds.value = newSet;
  syncingFromUser.value = true;
  emit('update:modelValue', normalizeSelection(Array.from(newSet)));
  nextTick(() => { syncingFromUser.value = false; });
};

const syncSelectionsFromModel = () => {
  if (props.mode !== 'select') return;
  syncingFromModel.value = true;
  
  const newSet = new Set<string>();
  rows.value.forEach((row) => {
    if (!row.disabled && props.modelValue.includes(row.appId)) {
      newSet.add(row.appId);
    }
  });
  selectedAppIds.value = newSet;
  
  nextTick(() => { syncingFromModel.value = false; });
};

watch([() => props.modelValue, rows], () => {
  if (props.mode !== 'select' || syncingFromUser.value) return;
  syncSelectionsFromModel();
}, { immediate: true });
</script>
