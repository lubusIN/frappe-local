<template>
  <div v-if="task" class="modal-overlay" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <div class="modal-card modal-card--large">
      <div class="modal-header">
        <div class="modal-header__title-group">
          <h3 class="modal-title">{{ task.taskName }}</h3>
          <span class="status-pill" :class="`status-pill--${task.status}`">
            {{ formattedStatus }}
            <span v-if="task.status === 'running' || task.status === 'queued'" class="status-spinner"></span>
          </span>
        </div>
        <div class="modal-header__actions">
          <button v-if="task.logs.length > 0" type="button" class="btn btn--subtle btn--sm" @click="onCopyLogs">
            <IconCopy class="w-3.5 h-3.5 mr-1.5" />
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
          <button type="button" class="btn btn--subtle btn--sm" @click="$emit('close')">Close</button>
        </div>
      </div>
      <div class="modal-body logs-container selectable-text" ref="logsContainer">
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
import { ref, watch, nextTick, computed } from 'vue';
import { toast } from 'frappe-ui';
import IconCopy from '~icons/lucide/copy';
import type { ProgressTaskSummary } from '../progress-center';

const props = defineProps<{
  task: ProgressTaskSummary | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const logsContainer = ref<HTMLElement | null>(null);

const formattedStatus = computed(() => {
  if (!props.task) return '';
  
  if (props.task.status === 'running' || props.task.status === 'queued') {
    const name = props.task.taskName.toLowerCase();
    if (name.includes('create bench') || name.includes('create site')) return 'Creating';
    if (name.includes('stop site') || name.includes('stop bench')) return 'Stopping';
    if (name.includes('start site') || name.includes('start bench')) return 'Starting';
    if (name.includes('restart bench') || name.includes('restart site')) return 'Restarting';
    if (name.includes('delete site') || name.includes('delete bench')) return 'Deleting';
    if (name.includes('clean bench')) return 'Cleaning';
    
    return props.task.stepName ? props.task.stepName.replace(/\.\.\./g, '') : 'Processing';
  }

  if (props.task.status === 'success') return 'Success';
  if (props.task.status === 'failure') return 'Failed';
  
  return props.task.status;
});

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

const copied = ref(false);

const onCopyLogs = async () => {
  if (!props.task?.logs.length || copied.value) return;
  
  const text = props.task.logs
    .map(log => `[${formatTime(log.timestamp)}] ${log.message}`)
    .join('\n');
    
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    toast.success('Logs copied to clipboard');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    toast.error('Failed to copy logs');
  }
};
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
  gap: 16px;
}

.modal-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--gray-light);
  color: var(--gray-text);
  text-transform: capitalize;
}

.status-pill--running,
.status-pill--success {
  background: var(--green-light, #f0fdf4);
  color: var(--green-text, #166534);
}

.status-pill--queued {
  background: var(--blue-light, #eff6ff);
  color: var(--blue-text, #1e40af);
}

.status-pill--failure {
  background: var(--red-light, #fef2f2);
  color: var(--red-text, #991b1b);
}

.status-spinner {
  display: block;
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

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
