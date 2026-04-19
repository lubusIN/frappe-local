<template>
  <section class="benches-view">
    <header class="view-header">
      <h2 class="view-header__title">Benches</h2>
      <div class="view-header__actions">
        <button type="button" class="btn btn--subtle" @click="refresh" :disabled="loading">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 8A6 6 0 114.8 4.8" /><path d="M14 2v4h-4" />
          </svg>
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load benches"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />

    <div v-if="successMessage" class="alert alert--success">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.78 5.28a.75.75 0 010 1.06l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 011.06-1.06L7.25 8.75l3.47-3.47a.75.75 0 011.06 0z" />
      </svg>
      {{ successMessage }}
    </div>

    <!-- Create form -->
    <div class="form-card">
      <h3 class="form-card__title">Create new bench</h3>
      <form class="form-grid" @submit.prevent="onCreateBench">
        <label class="form-field">
          <span class="form-label">Name</span>
          <input v-model="createForm.name" type="text" required placeholder="my-bench" />
        </label>
        <label class="form-field">
          <span class="form-label">Runtime</span>
          <select v-model="createForm.runtime">
            <option value="docker">docker</option>
            <option value="podman">podman</option>
          </select>
        </label>
        <label class="form-field form-field--full">
          <span class="form-label">Path</span>
          <input v-model="createForm.path" type="text" required placeholder="/path/to/bench" />
        </label>
        <label class="form-field">
          <span class="form-label">Frappe Version</span>
          <input v-model="createForm.frappeVersion" type="text" required />
        </label>
        <label class="form-field">
          <span class="form-label">Apps</span>
          <AppPicker
            v-model="createForm.appsSelected"
            :disabled="creating || loading"
            :runtime="createForm.runtime"
            :frappe-version="createForm.frappeVersion"
          />
        </label>
        <div class="form-actions form-field--full">
          <button class="btn btn--primary" type="submit" :disabled="creating || loading">
            {{ creating ? 'Creating…' : 'Create bench' }}
          </button>
        </div>
      </form>
    </div>

    <StatePanel
      v-if="!error && loading"
      kind="loading"
      title="Loading benches"
      body="Fetching the latest bench list and lifecycle state."
    />

    <StatePanel
      v-if="!error && !loading && benches.length === 0"
      kind="empty"
      title="No benches yet"
      body="Create your first bench to start lifecycle actions, logs, and folder shortcuts."
    />

    <!-- Bench list -->
    <div v-if="!error && !loading && benches.length > 0" class="list-table">
      <div class="list-table__header">
        <span class="list-col list-col--name">Name</span>
        <span class="list-col list-col--meta">Runtime</span>
        <span class="list-col list-col--meta">Frappe</span>
        <span class="list-col list-col--meta">Apps</span>
        <span class="list-col list-col--status">Status</span>
        <span class="list-col list-col--actions"></span>
      </div>
      <div
        v-for="bench in benches"
        :key="bench.id"
        class="list-table__row"
      >
        <div class="list-col list-col--name">
          <p class="list-col__primary">{{ bench.name }}</p>
          <p class="list-col__secondary">{{ bench.path }}</p>
        </div>
        <span class="list-col list-col--meta">{{ bench.runtime }}</span>
        <span class="list-col list-col--meta">{{ bench.frappeVersion }}</span>
        <span class="list-col list-col--meta">{{ bench.appCount }}</span>
        <span class="list-col list-col--status">
          <span class="status-pill" :class="`status-pill--${bench.status}`">{{ bench.status }}</span>
        </span>
        <div class="list-col list-col--actions">
          <button class="btn btn--subtle btn--sm" :disabled="updating || bench.status === 'running'" @click="onSetBenchStatus(bench.id, 'running')">Start</button>
          <button class="btn btn--subtle btn--sm" :disabled="updating || bench.status === 'stopped'" @click="onSetBenchStatus(bench.id, 'stopped')">Stop</button>
          <button class="btn btn--subtle btn--sm" :disabled="loadingLogs" @click="onLoadBenchLogs(bench.id)">Logs</button>
          <button class="btn btn--subtle btn--sm" :disabled="openingFolder" @click="onOpenBenchFolder(bench.id)">Folder</button>
          <button class="btn btn--danger btn--sm" :disabled="updating || deleting || bench.status === 'running'" @click="onDeleteBench(bench.id, bench.name)">Delete</button>
        </div>

        <!-- Logs panel -->
        <section v-if="activeBenchLogId === bench.id" class="logs-panel">
          <header class="logs-panel__header">
            <span class="logs-panel__title">Recent logs</span>
            <input v-model="benchLogFilter" class="logs-panel__filter" type="text" placeholder="Filter logs…" />
          </header>
          <ul class="logs-list">
            <li v-for="entry in filteredBenchLogs" :key="entry.id" class="logs-list__item">
              <p class="logs-list__message">{{ entry.message }}</p>
              <p class="logs-list__meta">{{ entry.level }} · {{ entry.timestamp }}</p>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <ConfirmationDialog
      :open="deleteConfirmOpen"
      title="Delete bench"
      :message="`Delete bench ${pendingDeleteBenchName}? This cannot be undone.`"
      confirm-label="Delete bench"
      @cancel="onCancelDelete"
      @confirm="onConfirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import AppPicker from '../components/AppPicker.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import StatePanel from '../components/StatePanel.vue';
import { useBenches } from '../composables/useBenches';

const {
  benches,
  loading,
  creating,
  updating,
  deleting,
  loadingLogs,
  openingFolder,
  error,
  successMessage,
  create,
  update,
  remove,
  listLogs,
  openFolder,
  refresh,
} = useBenches();

const createForm = reactive({
  name: '',
  path: '',
  frappeVersion: '15.0.0',
  runtime: 'docker' as 'docker' | 'podman',
  appsSelected: [] as string[],
});

const onCreateBench = async () => {
  await create({
    name: createForm.name,
    path: createForm.path,
    frappeVersion: createForm.frappeVersion,
    runtime: createForm.runtime,
    apps: [...createForm.appsSelected],
  });

  createForm.name = '';
  createForm.path = '';
  createForm.appsSelected = [];
};

const onSetBenchStatus = async (id: string, status: 'running' | 'stopped') => {
  await update(id, { status });
};

const activeBenchLogId = ref<string | null>(null);
const benchLogs = ref<Array<{ id: string; level: string; message: string; timestamp: string }>>([]);
const benchLogFilter = ref('');

const filteredBenchLogs = computed(() => {
  const query = benchLogFilter.value.trim().toLowerCase();
  if (!query) {
    return benchLogs.value;
  }

  return benchLogs.value.filter((entry) =>
    `${entry.message} ${entry.level}`.toLowerCase().includes(query)
  );
});

const deleteConfirmOpen = ref(false);
const pendingDeleteBenchId = ref<string | null>(null);
const pendingDeleteBenchName = ref('');

const onDeleteBench = async (id: string, name: string) => {
  pendingDeleteBenchId.value = id;
  pendingDeleteBenchName.value = name;
  deleteConfirmOpen.value = true;
};

const onCancelDelete = (): void => {
  deleteConfirmOpen.value = false;
  pendingDeleteBenchId.value = null;
  pendingDeleteBenchName.value = '';
};

const onConfirmDelete = async (): Promise<void> => {
  const id = pendingDeleteBenchId.value;
  if (!id) {
    onCancelDelete();
    return;
  }

  deleteConfirmOpen.value = false;
  await remove(id);
  onCancelDelete();
};

const onLoadBenchLogs = async (id: string) => {
  benchLogs.value = await listLogs(id);
  benchLogFilter.value = '';
  activeBenchLogId.value = id;
};

const onOpenBenchFolder = async (id: string) => {
  await openFolder(id);
};
</script>

<style scoped>
.benches-view {
  display: grid;
  gap: 16px;
}

/* View header */
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.view-header__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.view-header__actions {
  display: flex;
  gap: 8px;
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
  background: var(--surface-card);
}

.btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-text);
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn--danger {
  border-color: var(--red-border);
  color: var(--red-text);
  background: var(--surface-card);
}

.btn--danger:hover:not(:disabled) {
  background: var(--red-light);
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

.alert--success {
  color: var(--green-text);
  background: var(--green-light);
  border: 1px solid var(--green-border);
}

/* Form card */
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.form-card__title {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  padding: 16px;
}

.form-field {
  display: grid;
  gap: 4px;
}

.form-field--full {
  grid-column: 1 / -1;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

/* List table */
.list-table {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.list-table__header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 0.5fr 1fr 2fr;
  gap: 8px;
  padding: 8px 16px;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border-light);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.list-table__row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 0.5fr 1fr 2fr;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light);
  align-items: center;
  font-size: 13px;
}

.list-table__row:last-child {
  border-bottom: 0;
}

.list-col--name {
  min-width: 0;
}

.list-col__primary {
  margin: 0;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-col__secondary {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-col--meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.list-col--actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Status pill */
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--gray-light);
  color: var(--gray-text);
}

.status-pill--running,
.status-pill--success {
  background: var(--green-light);
  color: var(--green-text);
}

.status-pill--failure,
.status-pill--error {
  background: var(--red-light);
  color: var(--red-text);
}

/* Logs panel */
.logs-panel {
  grid-column: 1 / -1;
  border-top: 1px solid var(--border-light);
  padding: 12px 0 0;
  display: grid;
  gap: 8px;
}

.logs-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logs-panel__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.logs-panel__filter {
  flex: 1;
  max-width: 280px;
}

.logs-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.logs-list__item {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--surface-subtle);
}

.logs-list__message {
  margin: 0;
  font-size: 12px;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
}

.logs-list__meta {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}
</style>