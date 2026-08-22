<template>
  <section
    class="grid gap-3.5 rounded-6 border border-outline-blue-3 bg-surface-blue-2"
    :class="compact ? 'p-3.5' : 'p-4'"
  >
    <div class="flex items-start gap-2.5">
      <div class="flex h-8 w-8 min-w-8 items-center justify-center rounded-6 border border-outline-blue-3 bg-surface-base text-ink-blue-5">
        <span
          class="lucide-package h-4 w-4"
          aria-hidden="true"
        />
      </div>
      <div>
        <h4 class="m-0 text-sm-semibold text-ink-gray-9">
          {{ title }}
        </h4>
        <p class="mt-1 text-[13px] leading-relaxed text-ink-gray-6">
          {{ body }}
        </p>
      </div>
    </div>

    <ol
      v-if="steps && steps.length > 0"
      class="m-0 grid list-decimal gap-1.5 pl-5 text-[13px] leading-relaxed text-ink-gray-6"
    >
      <li
        v-for="step in steps"
        :key="step"
      >
        {{ step }}
      </li>
    </ol>

    <div
      v-if="links.length > 0"
      class="flex flex-wrap gap-2"
    >
      <Button
        v-for="link in links"
        :key="`${link.to || 'action'}-${link.label}`"
        variant="outline"
        class="min-h-7"
        @click="handleLinkClick(link)"
      >
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span>{{ link.label }}</span>
          <span
            class="lucide-chevron-right h-3 w-3 shrink-0"
            aria-hidden="true"
          />
        </span>
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Button } from 'frappe-ui';
import { useRouter } from 'vue-router';

export type FirstRunGuideLink = {
  label: string;
  to?: string;
  onClick?: () => void;
};

const router = useRouter();

const handleLinkClick = (link: FirstRunGuideLink) => {
  if (link.to) {
    void router.push(link.to);
    return;
  }

  link.onClick?.();
};

defineProps<{
  title: string;
  body: string;
  steps?: string[];
  links: FirstRunGuideLink[];
  compact?: boolean;
}>();
</script>
