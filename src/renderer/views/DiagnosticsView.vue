<template>
  <div class="diagnostics-view">

    <div class="diagnostics-container">
      <DiagnosticsPanel
        :report="report"
        :running="running"
        :fixing="fixing"
        :error="error"
        @run="run"
        @fix="fix"
      />
      
      <section class="info-card">
        <h3 class="info-card__title">Environment Tips</h3>
        <ul class="info-card__list">
          <li><strong>Podman Machine:</strong> On macOS and Windows, Podman runs inside a virtual machine. If you see connection errors, ensure the VM is started.</li>
          <li><strong>Storage Paths:</strong> Frappe Cafe needs write access to its user data directory to store bench templates and site metadata.</li>
          <li><strong>Network:</strong> Some diagnostic checks (like template updates) require an internet connection.</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import DiagnosticsPanel from '../components/DiagnosticsPanel.vue';
import { useDiagnostics } from '../composables/useDiagnostics';

const { report, running, fixing, error, run, fix } = useDiagnostics();
</script>

<style scoped>
.diagnostics-view {
  display: grid;
  gap: 24px;
}


.diagnostics-container {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  align-items: start;
}

.info-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface-card);
}

.info-card__title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.info-card__list {
  margin: 0;
  padding: 0 0 0 20px;
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

@media (max-width: 900px) {
  .diagnostics-container {
    grid-template-columns: 1fr;
  }
}
</style>
