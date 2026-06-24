<template>
  <section class="flex flex-col h-[60vh] gap-1">
    <header class="flex items-center gap-2.5 mb-3">
      <div class="min-w-[140px] flex-1">
        <TextInput 
          v-model="query"
          type="search"
          placeholder="Search my apps…"
          :disabled="disabled"
          variant="outline"
        >
          <template #prefix>
            <IconSearch class="w-4 text-ink-gray-6" />
          </template>
        </TextInput>
      </div>
    </header>

    <div
      v-if="error"
      class="px-2 py-3 text-xs text-center text-ink-red-8"
    >
      {{ error }}
    </div>
    <div
      v-else-if="loading"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      Loading custom apps…
    </div>
    <div
      v-else-if="rows.length === 0"
      class="px-2 py-3 text-xs text-center text-ink-gray-6"
    >
      No matching custom apps found.
    </div>

    <div
      v-else
      class="flex-1 min-h-0 mb-2 overflow-y-auto"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4 px-1">
        <div
          v-for="row in rows"
          :key="row.appId"
          class="flex flex-col relative bg-surface-base border rounded-xl p-4 transition-all duration-200 h-[190px]"
          :class="[
            row.disabled ? 'opacity-60 cursor-not-allowed border-outline-gray-2' : 'border-outline-gray-2 hover:border-outline-gray-4'
          ]"
        >
          <!-- Header: Icon & Verified Badge -->
          <div class="flex items-start justify-between mb-3">
            <img
              v-if="row.icon && !imageErrors[row.id]"
              :src="row.icon"
              class="w-10 h-10 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-outline-gray-2"
              @error="imageErrors[row.id] = true"
            >
            <div
              v-else
              class="flex w-10 h-10 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2 text-sm-semibold text-ink-gray-5 shadow-sm ring-1 ring-outline-gray-2"
            >
              {{ (row.title || row.appName).charAt(0).toUpperCase() }}
            </div>

            <!-- Top Right area -->
            <div class="flex items-center gap-2">
              <!-- Action Buttons -->
              <template v-if="context === 'bench'">
                <Button
                  v-if="row.isActive"
                  variant="outline"
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
                  variant="outline"
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
                  variant="outline"
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
            </div>
          </div>

          <!-- Title & Description -->
          <div class="flex flex-col min-h-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="text-sm-semibold text-ink-gray-9 truncate">
                {{ row.title || row.appName }}
              </h3>
            </div>
            <p
              class="text-xs text-ink-gray-5 leading-relaxed line-clamp-2"
              :title="row.description"
            >
              {{ row.description || 'No description provided' }}
            </p>
          </div>

          <!-- Footer: Categories & Actions/License -->
          <div class="flex items-center justify-between shrink-0 mt-auto">
            <!-- Categories -->
            <div class="flex items-center gap-1.5 flex-wrap overflow-hidden h-5">
              <Badge
                theme="gray"
                size="sm"
              >
                {{ row.type === 'github' ? 'GitHub' : 'Local' }}
              </Badge>
            </div>

            <!-- Bottom Right -->
            <div class="flex items-center gap-2 shrink-0 max-w-[50%]">
              <span
                class="text-[10px] uppercase text-ink-gray-4 font-medium tracking-wide truncate"
                :title="row.source"
              >
                {{ row.type === 'github' ? row.branch || 'main' : 'Local App' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Badge, Button, TextInput } from 'frappe-ui';
import IconSearch from '~icons/lucide/search';
import { computed, ref } from 'vue';
import { useCustomApps } from '@frappe-local/renderer/composables/data';

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    frappeVersion?: string;
    allowedAppIds?: readonly string[];
    
    context?: 'bench' | 'site';
    activeAppIds?: readonly string[];
    loadingAppId?: string | null;
  }>(),
  {
    disabled: false,
    activeAppIds: () => [],
    frappeVersion: '',
    allowedAppIds: undefined,
    context: 'bench',
    loadingAppId: null,
  }
);

const emit = defineEmits<{
  (e: 'add-app', appId: string): void;
  (e: 'remove-app', appId: string): void;
  (e: 'install-app', appId: string): void;
  (e: 'uninstall-app', appId: string): void;
}>();

const { customApps, loading, error } = useCustomApps();

const query = ref('');
const imageErrors = ref<Record<string, boolean>>({});

const allowedAppIds = computed(() => {
  if (!props.allowedAppIds) {
    return null;
  }
  return new Set(props.allowedAppIds.map((appId) => appId.trim()).filter(Boolean));
});

const visibleItems = computed(() =>
  customApps.value.filter((item) => {
    if (allowedAppIds.value && !allowedAppIds.value.has(item.name)) {
      return false;
    }

    if (query.value) {
      const q = query.value.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q) && !(item.title || '').toLowerCase().includes(q)) {
        return false;
      }
    }

    return true;
  })
);

const rows = computed(() =>
  visibleItems.value.map((item) => {
    const isActive = props.activeAppIds.includes(item.name);

    return {
      ...item,
      appId: item.name,
      appName: item.name,
      name: item.name,
      disabled: props.disabled,
      isActive,
    };
  })
);
</script>
