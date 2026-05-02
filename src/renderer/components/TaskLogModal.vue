<template>
  <div v-if="task" class="modal-overlay" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <div class="modal-card modal-card--large">
      <div class="modal-header">
        <div class="modal-header__title-group">
          <h3 class="modal-title">{{ task.taskName }}</h3>
          <span class="status-pill" :class="`status-pill--${task.status}`">{{ task.status }}</span>
        </div>
        <button type="button" class="btn btn--subtle btn--sm" @click="$emit('close')">Close</button>
      </div>
      <div class="modal-body logs-container" ref="logsContainer">
        <div v-if="task.logs.length === 0" class="logs-empty">
          No log entries yet...
        </div>
        <div v-for="(log, index) in task.logs" :key="index" class="log-entry" :class="`log-entry--${log.level || 'info'}`">
          <time class="log-time">{{ formatTime(log.timestamp) }}</time>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
      <div class="modal-footer">
        <p class="modal-hint">Verbose logs from background orchestration tasks.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ProgressTaskSummary } from '../progress-center';

const props = defineProps<{
  task: ProgressTaskSummary | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const logsContainer = ref<HTMLElement | null>(null);

const formatTime = (ts: string) => {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Auto-scroll to bottom when new logs arrive
watch(() => props.task?.logs.length, async () => {
  await nextTick();
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.modal-card {
  width: min(800px, 100%);
  border-radius: 8px;
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}

.modal-header {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header__title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.logs-container {
  padding: 16px;
  background: #000000;
  color: #e2e8f0;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  overflow-y: auto;
  line-height: 1.5;
  flex: 1;
}

.log-entry {
  display: flex;
  gap: 12px;
  margin-bottom: 2px;
}

.log-time {
  color: #718096;
  min-width: 70px;
  flex-shrink: 0;
}

.log-message {
  word-break: break-word;
  white-space: pre-wrap;
}

.log-entry--error .log-message {
  color: #feb2b2;
}

.log-entry--warning .log-message {
  color: #fbd38d;
}

.logs-empty {
  color: #718096;
  text-align: center;
  padding: 40px;
}

.modal-footer {
  padding: 10px 20px;
  background: var(--surface-subtle);
  border-top: 1px solid var(--border-light);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.modal-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.status-pill {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--gray-light);
  color: var(--gray-text);
}

.status-pill--running { background: var(--blue-light); color: var(--blue-text); }
.status-pill--success { background: var(--green-light); color: var(--green-text); }
.status-pill--failure { background: var(--red-light); color: var(--red-text); }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
</style>
