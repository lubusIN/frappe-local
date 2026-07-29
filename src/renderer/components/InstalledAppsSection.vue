<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <h3 class="text-base-semibold text-ink-gray-9">Installed Apps</h3>
      <Badge
        theme="gray"
        variant="subtle"
        class="rounded-full !px-1.5"
      >
        {{ displayAppIds.length }}
      </Badge>
    </div>

    <div
      v-if="displayAppIds.length === 0"
      class="text-sm text-ink-gray-5"
    >
      No apps installed.
    </div>

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
    >
      <div
        v-for="appId in displayAppIds"
        :key="appId"
        class="flex items-center gap-3 p-2 bg-surface-base border border-outline-gray-2 hover:border-outline-gray-3 transition-colors rounded-md"
      >
        <img
          v-if="getAppInfo(appId).icon && !imageErrors[appId]"
          :src="getAppInfo(appId).icon"
          class="w-10 h-10 shrink-0 rounded-md object-cover shadow-sm ring-1 ring-outline-gray-2"
          @error="imageErrors[appId] = true"
        >
        <div
          v-else
          class="flex w-8 h-8 shrink-0 items-center justify-center rounded-md bg-surface-gray-2 text-xs font-semibold text-ink-gray-5 shadow-sm ring-1 ring-outline-gray-2"
        >
          {{ (getAppInfo(appId).title || getAppInfo(appId).name || appId).charAt(0).toUpperCase() }}
        </div>

        <div class="flex-1 min-w-0">
          <div class="truncate text-sm font-medium text-ink-gray-9">
            {{ getAppTitle(appId) }}
          </div>
          <Badge
            v-if="getAppInfo(appId).type"
            variant="subtle"
            :theme="getAppInfo(appId).sourceBadgeTheme"
            class="mt-1 w-max"
          >
            {{ getAppInfo(appId).sourceBadgeLabel }}
          </Badge>
        </div>

        <Dropdown
          :options="getAppOpenOptions(appId)"
        >
          <Button
            variant="ghost"
            icon="lucide-more-vertical"
            class="!size-7 text-ink-gray-5 hover:text-ink-gray-9"
          />
        </Dropdown>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Badge, Button, Dropdown, toast } from 'frappe-ui';
import { ref, computed } from 'vue';
import { useAppCatalog, useBenches } from '@frappe-local/renderer/composables/data';
import { useEditorStatus } from '@frappe-local/renderer/composables/system';

const props = defineProps<{
  appIds: string[];
  benchId: string;
  benchStatus?: string;
  context: 'bench' | 'site';
}>();

const displayAppIds = computed(() => {
  const resolvedNames = new Set<string>();
  const uniqueIds: string[] = [];

  for (const id of props.appIds) {
    if (id === 'frappe') continue;
    
    const info = getAppInfo(id);
    const appName = info.name || id;
    
    if (!resolvedNames.has(appName)) {
      resolvedNames.add(appName);
      uniqueIds.push(id);
    }
  }

  return uniqueIds;
});

const emit = defineEmits<{
  (e: 'remove-app', appId: string): void;
}>();

const { getAppInfo, getAppTitle } = useAppCatalog();
const { isEditorInstalled } = useEditorStatus();
const { openAppInEditor, error: openError } = useBenches();

const imageErrors = ref<Record<string, boolean>>({});

const getAppOpenOptions = (appId: string) => {
  return [
    {
      group: 'Open in',
      options: [
        {
          label: 'VS Code',
          icon: 'lucide-code',
          disabled: !isEditorInstalled.value,
          onClick: async () => {
            await openAppInEditor(props.benchId, appId, false);
            if (openError.value) {
              toast.error(openError.value);
            }
          },
        },
        {
          label: 'Dev Container',
          icon: 'lucide-box',
          disabled: !isEditorInstalled.value || props.benchStatus !== 'running',
          onClick: async () => {
            await openAppInEditor(props.benchId, appId, true);
            if (openError.value) {
              toast.error(openError.value);
            }
          },
        },
      ],
    },
    {
      group: 'Manage',
      options: [
        {
          label: props.context === 'bench' ? 'Remove' : 'Uninstall',
          icon: 'lucide-trash-2',
          theme: 'red' as const,
          onClick: () => {
            emit('remove-app', appId);
          },
        },
      ],
    },
  ];
};
</script>
