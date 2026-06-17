<template>
  <div :class="[sizeClass, colorClass, 'font-mono transition-colors duration-200']">
    <span v-if="!showLabel">{{ formattedTime }}</span>
    <span v-else-if="running">Time elapsed: {{ formattedTime }}</span>
    <span v-else>Completed in: {{ formattedTime }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  startTime: string | number;
  endTime?: string | number;
  running?: boolean;
  showLabel?: boolean;
  sizeClass?: string;
  colorClass?: string;
}>(), {
  endTime: undefined,
  running: false,
  showLabel: true,
  sizeClass: 'text-sm',
  colorClass: 'text-ink-gray-6',
});

const now = ref(Date.now());
let intervalId: ReturnType<typeof setInterval> | null = null;

const updateNow = () => {
  now.value = Date.now();
};

const startTimer = () => {
  if (!intervalId && props.running) {
    intervalId = setInterval(updateNow, 1000);
    updateNow();
  }
};

const stopTimer = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

watch(() => props.running, (isRunning) => {
  if (isRunning) {
    startTimer();
  } else {
    stopTimer();
  }
});

onMounted(() => {
  if (props.running) {
    startTimer();
  }
});

onBeforeUnmount(() => {
  stopTimer();
});

const elapsedMs = computed(() => {
  const start = new Date(props.startTime).getTime();
  if (isNaN(start)) return 0;

  if (props.running) {
    return Math.max(0, now.value - start);
  }

  if (props.endTime) {
    const end = new Date(props.endTime).getTime();
    if (!isNaN(end)) {
      return Math.max(0, end - start);
    }
  }

  return 0;
});

const formattedTime = computed(() => {
  const ms = elapsedMs.value;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
});
</script>
