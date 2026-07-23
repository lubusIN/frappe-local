<template>
  <section :class="containerClass || 'flex flex-col h-[60vh] gap-1'">
    <header class="flex flex-col gap-3 mb-3">
      <div class="flex items-center">
        <TabButtons
          v-model="activeTab"
          :options="tabOptions"
        >
          <template #suffix="{ button }">
            <span
              class="rounded-full bg-surface-gray-2 px-1.5 text-xs text-ink-gray-7 ml-1"
            >
              {{ tabCounts[button.modelValue as 'installed' | 'available'] }}
            </span>
          </template>
        </TabButtons>
      </div>
      <div class="flex items-center gap-2.5">
        <div class="min-w-[140px] flex-1">
          <FormControl 
            v-model="query"
            type="text"
            placeholder="Search apps…"
            :disabled="disabled"
            @update:model-value="onSearch"
          >
            <template #prefix>
              <IconSearch class="w-4 text-ink-gray-6" />
            </template>
          </FormControl>
        </div>
        <div class="min-w-[120px] shrink-0 text-xs">
          <FormControl
            v-model="categoryFilter"
            type="select"
            :disabled="disabled || state.loading"
            :options="categoryOptions"
          />
        </div>
      </div>
    </header>

    <div
      v-if="(state.error || customAppsError) && displayedApps.length === 0"
      class="px-2 py-3 text-xs text-center text-ink-red-8"
    >
      {{ state.error || customAppsError }}
    </div>
    <div
      v-else-if="(state.loading || customAppsLoading) && displayedApps.length === 0"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      Loading apps…
    </div>
    <div
      v-else-if="displayedApps.length === 0"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      No matching apps.
    </div>

    <div
      v-else
      :class="containerClass ? 'flex-1 min-h-0 mb-2 w-full' : 'flex-1 min-h-0 mb-2 overflow-y-auto w-full'"
    >
      <div class="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 pb-4 px-1 w-full">
        <div
          v-for="app in displayedApps"
          :key="app.appId"
          class="flex flex-col relative bg-surface-base border rounded-xl p-4 transition-all duration-200 h-[190px]"
          :class="[
            app.disabled ? 'opacity-60 cursor-not-allowed border-outline-gray-2' : 'border-outline-gray-2 hover:border-outline-gray-4'
          ]"
        >
          <!-- Header: Icon & Verified Badge -->
          <div class="flex items-start justify-between mb-3">
            <img
              v-if="app.icon && !imageErrors[app.appId]"
              :src="app.icon"
              class="w-10 h-10 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-outline-gray-2"
              @error="imageErrors[app.appId] = true"
            >
            <div
              v-else
              class="flex w-10 h-10 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2 text-sm-semibold text-ink-gray-5 shadow-sm ring-1 ring-outline-gray-2"
            >
              {{ (app.appName || '').charAt(0).toUpperCase() }}
            </div>

            <!-- Top Right area -->
            <div class="flex items-center gap-2">
              <Dropdown
                v-if="context === 'bench' && (app.isActive || app.appId === 'frappe')"
                :options="getAppOpenOptions(app)"
              >
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="getAppOpenOptions(app).every(o => Boolean(o.disabled))"
                >
                  Open In
                </Button>
              </Dropdown>

              <!-- Action Buttons -->
              <template v-if="app.appId === 'frappe'">
                <Badge
                  theme="gray"
                  variant="subtle"
                >
                  Core App
                </Badge>
              </template>
              <template v-else-if="context === 'bench'">
                <Button
                  v-if="app.isActive"
                  variant="outline"
                  theme="red"
                  size="sm"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== app.appId)"
                  :loading="loadingAppId === app.appId"
                  @click.stop="emit('remove-app', app.appId)"
                >
                  Remove
                </Button>
                <Button
                  v-else
                  variant="outline"
                  size="sm"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== app.appId)"
                  :loading="loadingAppId === app.appId"
                  @click.stop="emit('add-app', app.appId)"
                >
                  Get
                </Button>
              </template>
              <template v-else-if="context === 'site'">
                <Button
                  v-if="app.isActive"
                  variant="outline"
                  theme="red"
                  size="sm"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== app.appId)"
                  :loading="loadingAppId === app.appId"
                  @click.stop="emit('uninstall-app', app.appId)"
                >
                  Uninstall
                </Button>
                <Button
                  v-else
                  variant="outline"
                  size="sm"
                  :disabled="disabled || (loadingAppId !== null && loadingAppId !== app.appId)"
                  :loading="loadingAppId === app.appId"
                  @click.stop="emit('install-app', app.appId)"
                >
                  Install
                </Button>
              </template>
            </div>
          </div>

          <!-- Title & Description -->
          <div class="flex flex-col min-h-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="text-sm-semibold text-ink-gray-9 truncate">
                {{ app.appName }}
              </h3>
            </div>
            <p
              class="text-xs text-ink-gray-5 leading-relaxed line-clamp-2"
              :title="app.description"
            >
              {{ app.description || 'No description provided' }}
            </p>
            
            <div
              v-if="app.supportText"
              class="mt-1"
            >
              <span
                class="text-[10px] font-medium"
                :class="{
                  'text-ink-amber-6': app.compatibilityStatus === 'warning',
                  'text-ink-red-8': app.compatibilityStatus === 'blocked',
                  'text-ink-gray-6': app.compatibilityStatus !== 'warning' && app.compatibilityStatus !== 'blocked',
                }"
              >
                {{ app.supportText }}
              </span>
            </div>
          </div>

          <!-- Footer: Source Badge & Source/License Text -->
          <div class="flex items-center justify-between shrink-0 mt-auto">
            <!-- Source Badge -->
            <div class="flex items-center gap-1.5 flex-wrap overflow-hidden h-5">
              <Badge
                :theme="app.sourceBadgeTheme"
                size="sm"
              >
                {{ app.sourceBadgeLabel }}
              </Badge>
            </div>

            <!-- Bottom Right -->
            <div class="flex items-center gap-2 shrink-0 max-w-[45%]">
              <span
                class="text-[10px] uppercase text-ink-gray-4 font-medium tracking-wide truncate"
                :title="app.sourceTitle"
              >
                {{ app.sourceText }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { TabButtons, FormControl, Button, Dropdown, Badge, toast } from 'frappe-ui';
import IconSearch from '~icons/lucide/search';
import IconCode from '~icons/lucide/code';
import IconBox from '~icons/lucide/box';
import { computed, ref, type Component } from 'vue';
import type { CatalogAppItem } from '@frappe-local/shared/core';
import { useAppCatalogFilters, useBenches, useCustomApps } from '@frappe-local/renderer/composables/data';
import { useEditorStatus } from '@frappe-local/renderer/composables/system';

const { isEditorInstalled } = useEditorStatus();

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    resourceId?: string;
    benchStatus?: string;
    frappeVersion?: string;
    allowedAppIds?: readonly string[];
    
    context?: 'bench' | 'site';
    activeAppIds?: readonly string[];
    loadingAppId?: string | null;
    containerClass?: string;
  }>(),
  {
    disabled: false,
    resourceId: undefined,
    benchStatus: undefined,
    activeAppIds: () => [],
    frappeVersion: '',
    allowedAppIds: undefined,
    context: 'bench',
    loadingAppId: null,
    containerClass: undefined,
  }
);

const emit = defineEmits<{
  (e: 'add-app', appId: string): void;
  (e: 'remove-app', appId: string): void;
  (e: 'install-app', appId: string): void;
  (e: 'uninstall-app', appId: string): void;
}>();

const activeTab = ref('installed');

const { openAppInEditor, error: openError } = useBenches();

interface AppItem {
  appId: string;
  appName: string;
  sourceBadgeLabel?: string;
}

interface DropdownOption {
  label: string;
  icon?: Component;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
}

const getAppOpenOptions = (app: AppItem): DropdownOption[] => {
  return [
    {
      label: 'VS Code',
      icon: IconCode,
      disabled: !isEditorInstalled.value,
      onClick: async () => {
        await openAppInEditor(props.resourceId ?? null, app.appId, false);
        if (openError.value) {
          toast.error(openError.value);
        }
      },
    },
    {
      label: 'Dev Container',
      icon: IconBox,
      disabled: !isEditorInstalled.value || props.benchStatus !== 'running',
      onClick: async () => {
        await openAppInEditor(props.resourceId ?? null, app.appId, true);
        if (openError.value) {
          toast.error(openError.value);
        }
      },
    },
  ];
};

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

const { customApps, loading: customAppsLoading, error: customAppsError } = useCustomApps();

const imageErrors = ref<Record<string, boolean>>({});
const allowedAppIds = computed(() => {
  if (props.context === 'site' || !props.allowedAppIds) {
    return null;
  }
  return new Set(props.allowedAppIds.map((appId) => appId.trim()).filter(Boolean));
});

const visibleItems = computed(() =>
  items.value.filter((item) => {
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

const visibleCustomApps = computed(() => {
  if (categoryFilter.value) {
    return [];
  }
  return customApps.value.filter((item) => {
    if (allowedAppIds.value && !allowedAppIds.value.has(item.name) && !allowedAppIds.value.has(item.id)) {
      return false;
    }

    if (query.value) {
      const q = query.value.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q) && !(item.title || '').toLowerCase().includes(q)) {
        return false;
      }
    }

    return true;
  });
});

const catalogAppItems = computed(() =>
  visibleItems.value.map((item) => {
    const compatibility = evaluateCompatibility(item as CatalogAppItem);
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
      sourceBadgeLabel: 'Registry',
      sourceBadgeTheme: 'gray' as const,
      sourceText: item.license || 'Unknown',
      sourceTitle: item.license || 'Unknown',
      categories: item.categories || [],
    };
  })
);

const customAppItems = computed(() =>
  visibleCustomApps.value.map((item) => {
    const isActive = props.activeAppIds.includes(item.id) || props.activeAppIds.includes(item.name);
    const catalogMatch = (state.value.data || []).find((app) => app.id === item.name || app.name === item.name);
    const licenseText = item.license || catalogMatch?.license || 'Unknown';

    return {
      ...item,
      appId: item.id,
      appName: item.title || item.name,
      name: item.name,
      disabled: props.disabled,
      isActive,
      compatibilityStatus: 'ok' as const,
      supportText: '',
      sourceBadgeLabel: item.type === 'github' ? 'GitHub' : 'Local',
      sourceBadgeTheme: 'gray' as const,
      sourceText: licenseText,
      sourceTitle: licenseText,
      categories: [] as string[],
    };
  })
);

const allApps = computed(() => [...catalogAppItems.value, ...customAppItems.value]);
const installedApps = computed(() => allApps.value.filter((app) => app.isActive));
const availableApps = computed(() => allApps.value.filter((app) => !app.isActive));

const installedCount = computed(() => installedApps.value.length);
const availableCount = computed(() => availableApps.value.length);

const tabOptions = [
  { label: 'Installed', value: 'installed' },
  { label: 'Available', value: 'available' }
];

const tabCounts = computed(() => ({
  installed: installedCount.value,
  available: availableCount.value
}));

const displayedApps = computed(() => {
  return activeTab.value === 'installed' ? installedApps.value : availableApps.value;
});
</script>
