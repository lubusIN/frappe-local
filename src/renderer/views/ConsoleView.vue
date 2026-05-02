<template>
  <section class="console-view">


    <StatePanel
      v-if="error"
      kind="error"
      title="Console action failed"
      :body="error"
      action-label="Retry context"
      @action="loadContext"
    />

    <div v-if="contextNotice" class="alert alert--warning">
      <IconAlertTriangle class="alert-icon" />
      {{ contextNotice }}
    </div>

    <FirstRunGuide
      v-if="!loadingContext && benches.length === 0"
      title="Console needs a bench context"
      body="The console is scoped to a bench or site. Create a bench first, then this page can run commands, open folders, and attach editor tooling to that context."
      :links="consoleSetupLinks"
      compact
    />

    <!-- Context selectors -->
    <div v-if="benches.length > 0" class="form-card">
      <div class="form-card__header">
        <h3 class="form-card__title">Session context</h3>
        <div class="console-status-badge">
          <span class="status-dot" :class="hasSession ? 'status-dot--active' : 'status-dot--inactive'"></span>
          {{ sessionState }}
        </div>
      </div>
      <div class="console-context">
        <div class="context-row">
          <label class="form-field">
            <span class="form-label">Bench</span>
            <select v-model="selectedBenchId" :disabled="loadingContext">
              <option value="" disabled>Select a bench</option>
              <option v-for="bench in benches" :key="bench.id" :value="bench.id">{{ bench.name }}</option>
            </select>
          </label>
          <label class="form-field">
            <span class="form-label">Site (optional)</span>
            <select v-model="selectedSiteId" :disabled="loadingContext || !selectedBenchId">
              <option :value="null">Bench root</option>
              <option v-for="site in filteredSites" :key="site.id" :value="site.id">{{ site.name }}</option>
            </select>
          </label>
        </div>

        <div class="console-toolbar">
          <button class="btn btn--primary btn--sm" :disabled="hasSession || starting || !selectedBenchId" @click="startSession">
            {{ starting ? 'Starting…' : 'Start' }}
          </button>
          <button class="btn btn--subtle btn--sm" :disabled="!hasSession || stopping" @click="stopSession">
            {{ stopping ? 'Stopping…' : 'Stop' }}
          </button>
          <button class="btn btn--subtle btn--sm" :disabled="reconnecting || !selectedBenchId" @click="reconnect">
            {{ reconnecting ? 'Reconnecting…' : 'Reconnect' }}
          </button>
          <div class="toolbar-divider"></div>
          <button class="btn btn--subtle btn--sm" @click="clearOutput">Clear</button>
          <button class="btn btn--subtle btn--sm" :disabled="copyingOutput || output.length === 0" @click="copyOutput">
            {{ copyingOutput ? 'Copying…' : 'Copy' }}
          </button>
          <button class="btn btn--subtle btn--sm" :disabled="openingFolder || !selectedBenchId" @click="openContextFolder">Folder</button>
          <button class="btn btn--subtle btn--sm" :disabled="openingEditor || !selectedBenchId" @click="openContextInEditor">Editor</button>
          <button class="btn btn--subtle btn--sm" :disabled="openingDevcontainer || !selectedBenchId" @click="openDevcontainer">Devcontainer</button>
        </div>

        <p class="context-info">
          <span class="context-info__label">Target:</span> {{ currentContextLabel }}
          <template v-if="sessionId"> · <span class="context-info__label">ID:</span> {{ sessionId }}</template>
        </p>
      </div>
    </div>

    <!-- Terminal output -->
    <div class="terminal-card">
      <StatePanel
        v-if="output.length === 0"
        kind="empty"
        title="No console output yet"
        body="Start a session to begin running commands."
      />
      <pre v-else class="terminal-output" role="log" aria-live="polite">{{ output.join('') }}</pre>
    </div>

    <!-- Command input -->
    <form v-if="benches.length > 0" class="command-bar" @submit.prevent="runCommand">
      <span class="command-prefix">{{ currentPromptPrefix }}</span>
      <input
        v-model="commandInput"
        type="text"
        class="command-input"
        placeholder="Type a command and press Enter"
        :disabled="!canRunCommands || executing"
        @keydown.up.prevent="stepHistory('older')"
        @keydown.down.prevent="stepHistory('newer')"
      >
      <button type="submit" class="btn btn--primary btn--sm" :disabled="!canRunCommands || executing || !commandInput.trim()">
        {{ executing ? 'Running…' : 'Run' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconAlertTriangle from '~icons/lucide/alert-triangle';
import FirstRunGuide, { type FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import StatePanel from '../components/StatePanel.vue';
import { useTerminalSession } from '../composables/useTerminalSession';

const {
  benches,
  selectedBenchId,
  selectedSiteId,
  loadingContext,
  starting,
  stopping,
  reconnecting,
  executing,
  copyingOutput,
  openingFolder,
  openingEditor,
  openingDevcontainer,
  sessionId,
  sessionState,
  output,
  commandInput,
  error,
  contextNotice,
  hasSession,
  canRunCommands,
  filteredSites,
  currentContextLabel,
  currentPromptPrefix,
  loadContext,
  startSession,
  stopSession,
  reconnect,
  clearOutput,
  copyOutput,
  openContextFolder,
  openContextInEditor,
  openDevcontainer,
  runCommand,
  stepHistory,
} = useTerminalSession();

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();

watch(() => loadingContext.value, () => {
  setPageHeaderActions([
    {
      id: 'console-refresh',
      label: loadingContext.value ? 'Refreshing…' : 'Refresh Context',
      variant: 'subtle',
      disabled: loadingContext.value,
      icon: IconRotateCcw,
      onClick: () => {
        void loadContext();
      },
    },
  ]);
}, { immediate: true });

onBeforeUnmount(() => {
  clearPageHeaderActions();
});



const consoleSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Create a bench', to: '/benches' },
  { label: 'Create a site', to: '/sites' },
]);
</script>

<style scoped>
.console-view {
  display: grid;
  gap: 16px;
}



/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.btn--subtle {
  border-color: var(--border-default);
}

.btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-text);
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn--sm {
  min-height: 24px;
  padding: 0 8px;
  font-size: 11px;
}

/* Alert */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.alert--warning {
  color: var(--orange-text);
  background: var(--orange-light);
  border: 1px solid var(--orange-border);
}

/* Form card */
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.form-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}

.form-card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.console-status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot--active {
  background: var(--green-text);
}

.status-dot--inactive {
  background: var(--text-muted);
}

.console-context {
  padding: 16px;
  display: grid;
  gap: 12px;
}

.context-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-field {
  display: grid;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.console-toolbar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: var(--border-light);
  margin: 0 4px;
}

.context-info {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.context-info__label {
  color: var(--text-secondary);
  font-weight: 500;
}

/* Terminal */
.terminal-card {
  min-height: 260px;
  max-height: 440px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: #1a1a2e;
  color: #e0e0e0;
}

.terminal-output {
  margin: 0;
  padding: 16px;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}

/* Command bar */
.command-bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
}

.command-prefix {
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  min-height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border-light);
  background: var(--surface-subtle);
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.command-input {
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}
</style>