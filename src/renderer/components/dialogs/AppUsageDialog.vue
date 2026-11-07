<template>
  <Dialog
    :model-value="open"
    :title="title"
    size="md"
    @update:model-value="$emit('update:open', $event)"
  >
    <template #title>
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-8 h-8 rounded-6 min-w-8 bg-surface-yellow-2 text-ink-yellow-7">
          <span
            class="lucide-alert-triangle h-[18px] w-[18px]"
            aria-hidden="true"
          />
        </div>
        <h3 class="m-0 text-sm-semibold text-ink-gray-9">
          {{ title }}
        </h3>
      </div>
    </template>

    <template #default>
      <p class="mb-4 text-[13px] leading-relaxed text-ink-gray-5">
        Cannot remove <strong>{{ appName }}</strong> because it is currently in use by the following:
      </p>

      <div class="space-y-4">
        <div v-if="usage.benches.length > 0">
          <h4 class="text-xs-semibold text-ink-gray-9 mb-2 uppercase tracking-wider">
            Benches
          </h4>
          <ul class="space-y-1">
            <li
              v-for="bench in usage.benches"
              :key="bench"
              class="text-sm text-ink-gray-6 flex items-center gap-2"
            >
              <span
                class="lucide-box w-4 text-ink-gray-4"
                aria-hidden="true"
              />
              {{ bench }}
            </li>
          </ul>
        </div>

        <div v-if="usage.sites.length > 0">
          <h4 class="text-xs-semibold text-ink-gray-9 mb-2 uppercase tracking-wider">
            Sites
          </h4>
          <ul class="space-y-1">
            <li
              v-for="site in usage.sites"
              :key="site"
              class="text-sm text-ink-gray-6 flex items-center gap-2"
            >
              <span
                class="lucide-app-window w-4 text-ink-gray-4"
                aria-hidden="true"
              />
              {{ site }}
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex justify-end">
        <Button
          size="md"
          variant="solid"
          @click="$emit('update:open', false)"
        >
          Okay
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, Button } from 'frappe-ui';

defineProps<{
  open: boolean;
  appName: string;
  title: string;
  usage: {
    benches: string[];
    sites: string[];
  };
}>();

defineEmits<{
  'update:open': [value: boolean];
}>();
</script>
