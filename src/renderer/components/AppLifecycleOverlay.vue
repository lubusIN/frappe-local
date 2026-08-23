<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { AppLifecycleStateEvent } from '@frappe-local/shared/core';
import { LoadingIndicator } from 'frappe-ui';
import Logo from './ui/Logo.vue';
import TaskTimer from './ui/TaskTimer.vue';

const state = ref<'starting' | 'ready' | 'stopping' | 'resetting'>('ready');
const message = ref<string>('');
const startTime = ref<number>(Date.now());

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  if (window.frappeLocal?.onAppLifecycleStateChange) {
    unsubscribe = window.frappeLocal.onAppLifecycleStateChange((event: AppLifecycleStateEvent) => {
      if (state.value === 'ready' && event.state !== 'ready') {
        startTime.value = Date.now();
      }
      state.value = event.state;
      if (event.message) {
        message.value = event.message;
      }
    });
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state !== 'ready'"
      class="fixed inset-0 z-[9999] bg-surface-base/90 flex flex-col items-center justify-center backdrop-blur-sm"
    >
      <Logo class="w-24 h-24 mb-6 text-ink-gray-9 animate-pulse" />
      <LoadingIndicator class="w-8 h-8 mb-4 text-ink-gray-9" />
      <h2 class="text-2xl-semibold text-ink-gray-9">
        <template v-if="state === 'starting'">Starting Frappe Local</template>
        <template v-else-if="state === 'stopping'">Stopping Frappe Local</template>
        <template v-else-if="state === 'resetting'">Resetting Frappe Local</template>
      </h2>
      <p class="mt-2 text-ink-gray-6">
        <template v-if="message">{{ message }}</template>
        <template v-else>This may take a few moments. Please keep the application open.</template>
      </p>
      <div class="mt-6">
        <TaskTimer
          :start-time="startTime"
          :running="true"
          size-class="text-sm"
          color-class="text-ink-gray-5"
        />
      </div>
    </div>
  </Teleport>
</template>
