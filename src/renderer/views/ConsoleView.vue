<template>
  <section class="console-view">
    <header class="console-header">
      <div>
        <p class="card-eyebrow">
          Developer Tools
        </p>
        <h3 class="console-title">
          Console
        </h3>
      </div>
      <div class="console-header-actions">
        <button
          type="button"
          class="console-btn"
          :disabled="loadingContext"
          @click="loadContext"
        >
          {{ loadingContext ? 'Refreshing…' : 'Refresh Context' }}
        </button>
      </div>
    </header>

    <StatePanel
      v-if="error"
      kind="error"
      title="Console action failed"
      :body="error"
      action-label="Retry context"
      @action="loadContext"
    />

    <p
      v-if="contextNotice"
      class="console-notice"
    >
      {{ contextNotice }}
    </p>

    <div class="console-context">
      <label class="console-field">
        <span>Bench</span>
        <select
          v-model="selectedBenchId"
          :disabled="loadingContext"
        >
          <option
            value=""
            disabled
          >Select a bench</option>
          <option
            v-for="bench in benches"
            :key="bench.id"
            :value="bench.id"
          >{{ bench.name }}</option>
        </select>
      </label>

      <label class="console-field">
        <span>Site (optional)</span>
        <select
          v-model="selectedSiteId"
          :disabled="loadingContext || !selectedBenchId"
        >
          <option :value="null">Bench root</option>
          <option
            v-for="site in filteredSites"
            :key="site.id"
            :value="site.id"
          >{{ site.name }}</option>
        </select>
      </label>

      <div class="console-session-actions">
        <button
          type="button"
          class="console-btn"
          :disabled="hasSession || starting || !selectedBenchId"
          @click="startSession"
        >
          {{ starting ? 'Starting…' : 'Start' }}
        </button>
        <button
          type="button"
          class="console-btn"
          :disabled="!hasSession || stopping"
          @click="stopSession"
        >
          {{ stopping ? 'Stopping…' : 'Stop' }}
        </button>
        <button
          type="button"
          class="console-btn"
          :disabled="reconnecting || !selectedBenchId"
          @click="reconnect"
        >
          {{ reconnecting ? 'Reconnecting…' : 'Reconnect' }}
        </button>
        <button
          type="button"
          class="console-btn"
          @click="clearOutput"
        >
          Clear
        </button>
        <button
          type="button"
          class="console-btn"
          :disabled="copyingOutput || output.length === 0"
          @click="copyOutput"
        >
          {{ copyingOutput ? 'Copying…' : 'Copy Output' }}
        </button>
        <button
          type="button"
          class="console-btn"
          :disabled="openingFolder || !selectedBenchId"
          @click="openContextFolder"
        >
          {{ openingFolder ? 'Opening…' : 'Open Folder' }}
        </button>
        <button
          type="button"
          class="console-btn"
          :disabled="openingEditor || !selectedBenchId"
          @click="openContextInEditor"
        >
          {{ openingEditor ? 'Opening…' : 'Open in Editor' }}
        </button>
        <button
          type="button"
          class="console-btn"
          :disabled="openingDevcontainer || !selectedBenchId"
          @click="openDevcontainer"
        >
          {{ openingDevcontainer ? 'Opening…' : 'Open Devcontainer Files' }}
        </button>
      </div>
    </div>

    <div class="console-status">
      <span class="console-status-label">Session:</span>
      <span class="console-status-value">{{ sessionState }}</span>
      <span class="console-status-target">Target: {{ currentContextLabel }}</span>
      <span
        v-if="sessionId"
        class="console-session-id"
      >ID: {{ sessionId }}</span>
    </div>

    <p class="console-policy">
      Switching bench or site resets the current session so commands stay scoped to the selected context.
    </p>

    <div
      class="console-output"
      role="log"
      aria-live="polite"
    >
      <StatePanel
        v-if="output.length === 0"
        kind="empty"
        title="No console output yet"
        body="Start a session to begin running commands."
      />
      <pre
        v-else
        class="console-log"
      >{{ output.join('') }}</pre>
    </div>

    <form
      class="console-input-row"
      @submit.prevent="runCommand"
    >
      <span class="console-prompt-prefix">{{ currentPromptPrefix }}</span>
      <input
        v-model="commandInput"
        type="text"
        class="console-input"
        placeholder="Type a command and press Enter"
        :disabled="!canRunCommands || executing"
        @keydown.up.prevent="stepHistory('older')"
        @keydown.down.prevent="stepHistory('newer')"
      >
      <button
        type="submit"
        class="console-btn"
        :disabled="!canRunCommands || executing || !commandInput.trim()"
      >
        {{ executing ? 'Sending…' : 'Run' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
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
</script>

<style scoped>
.console-view {
  display: grid;
  gap: 16px;
}

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.console-context {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.console-field {
  display: grid;
  gap: 6px;
}

.console-field select,
.console-input {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(8, 12, 22, 0.72);
  color: inherit;
  padding: 10px 12px;
}

.console-session-actions {
  display: flex;
  align-items: end;
  gap: 8px;
  flex-wrap: wrap;
}

.console-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(24, 90, 171, 0.25);
  color: inherit;
  border-radius: 8px;
  padding: 9px 12px;
  cursor: pointer;
}

.console-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.console-status {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.92rem;
  flex-wrap: wrap;
}

.console-status-value {
  text-transform: capitalize;
  font-weight: 600;
}

.console-session-id {
  opacity: 0.8;
}

.console-status-target,
.console-policy,
.console-notice {
  opacity: 0.85;
}

.console-notice {
  color: #f8d98c;
}

.console-output {
  min-height: 260px;
  max-height: 440px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: rgba(8, 10, 15, 0.9);
  padding: 12px;
}

.console-log {
  margin: 0;
  font-family: ui-monospace, Menlo, Monaco, SFMono-Regular, monospace;
  font-size: 0.86rem;
  line-height: 1.4;
  white-space: pre-wrap;
}

.console-input-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
}

.console-prompt-prefix {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.06);
  font-family: ui-monospace, Menlo, Monaco, SFMono-Regular, monospace;
  font-size: 0.82rem;
}

</style>