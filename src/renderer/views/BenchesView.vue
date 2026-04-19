<template>
  <section class="benches-view">
    <header class="benches-header">
      <div>
        <p class="card-eyebrow">Bench Management</p>
        <h3 class="benches-title">Local benches</h3>
      </div>
      <button type="button" class="benches-refresh" @click="refresh" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load benches"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />
    <p v-if="successMessage" class="benches-success">{{ successMessage }}</p>

    <form class="benches-form" @submit.prevent="onCreateBench">
      <label class="benches-field">
        <span>Name</span>
        <input v-model="createForm.name" type="text" required />
      </label>
      <label class="benches-field">
        <span>Runtime</span>
        <select v-model="createForm.runtime">
          <option value="docker">docker</option>
          <option value="podman">podman</option>
        </select>
      </label>
      <label class="benches-field benches-field--full">
        <span>Path</span>
        <input v-model="createForm.path" type="text" required />
      </label>
      <label class="benches-field">
        <span>Frappe Version</span>
        <input v-model="createForm.frappeVersion" type="text" required />
      </label>
      <label class="benches-field">
        <span>Apps</span>
        <AppPicker
          v-model="createForm.appsSelected"
          :disabled="creating || loading"
          :runtime="createForm.runtime"
          :frappe-version="createForm.frappeVersion"
        />
      </label>
      <div class="benches-actions benches-field--full">
        <button class="benches-create" type="submit" :disabled="creating || loading">
          {{ creating ? 'Creating…' : 'Create bench' }}
        </button>
      </div>
    </form>

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

    <ul v-if="!error && !loading && benches.length > 0" class="benches-grid">
      <li v-for="bench in benches" :key="bench.id" class="bench-card">
        <div class="bench-card-top">
          <h4 class="bench-name">{{ bench.name }}</h4>
          <span class="bench-status" :class="`bench-status--${bench.status}`">{{ bench.status }}</span>
        </div>
        <p class="bench-path">{{ bench.path }}</p>
        <dl class="bench-meta">
          <div>
            <dt>Runtime</dt>
            <dd>{{ bench.runtime }}</dd>
          </div>
          <div>
            <dt>Frappe</dt>
            <dd>{{ bench.frappeVersion }}</dd>
          </div>
          <div>
            <dt>Apps</dt>
            <dd>{{ bench.appCount }}</dd>
          </div>
        </dl>
        <div class="bench-card-actions">
          <button
            class="bench-action"
            type="button"
            :disabled="updating || bench.status === 'running'"
            @click="onSetBenchStatus(bench.id, 'running')"
          >
            Start
          </button>
          <button
            class="bench-action"
            type="button"
            :disabled="updating || bench.status === 'stopped'"
            @click="onSetBenchStatus(bench.id, 'stopped')"
          >
            Stop
          </button>
          <button
            class="bench-action bench-action--danger"
            type="button"
            :disabled="updating || deleting || bench.status === 'running'"
            @click="onDeleteBench(bench.id, bench.name)"
          >
            {{ deleting ? 'Deleting…' : 'Delete' }}
          </button>
          <button
            class="bench-action"
            type="button"
            :disabled="loadingLogs"
            @click="onLoadBenchLogs(bench.id)"
          >
            {{ loadingLogs ? 'Loading logs…' : 'View logs' }}
          </button>
          <button
            class="bench-action"
            type="button"
            :disabled="openingFolder"
            @click="onOpenBenchFolder(bench.id)"
          >
            {{ openingFolder ? 'Opening…' : 'Open folder' }}
          </button>
        </div>

        <section v-if="activeBenchLogId === bench.id" class="bench-logs-panel">
          <header class="bench-logs-header">
            <p class="bench-logs-title">Recent logs</p>
            <input
              v-model="benchLogFilter"
              class="bench-logs-filter"
              type="text"
              placeholder="Filter logs"
            />
          </header>
          <ul class="bench-logs-list">
            <li v-for="entry in filteredBenchLogs" :key="entry.id" class="bench-log-item">
              <p class="bench-log-message">{{ entry.message }}</p>
              <p class="bench-log-meta">{{ entry.level }} · {{ entry.timestamp }}</p>
            </li>
          </ul>
        </section>
      </li>
    </ul>

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
  gap: 14px;
}

.benches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.benches-title {
  margin: 0;
  font-size: 20px;
  color: #1f272e;
}

.benches-refresh,
.benches-create,
.bench-action {
  border: 1px solid #d7dee8;
  background: #ffffff;
  color: #334155;
}

.benches-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  padding: 14px;
  border: 1px solid #e4e9ef;
  border-radius: 12px;
  background: #ffffff;
}

.benches-field {
  display: grid;
  gap: 6px;
}

.benches-field > span {
  font-size: 12px;
  color: #64748b;
}

.benches-field--full,
.benches-actions {
  grid-column: 1 / -1;
}

.benches-grid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.bench-card {
  padding: 14px;
  border: 1px solid #e4e9ef;
  border-radius: 12px;
  background: #ffffff;
  display: grid;
  gap: 10px;
}

.bench-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.bench-name {
  margin: 0;
  font-size: 16px;
  color: #1f272e;
}

.bench-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid #d7dee8;
  color: #475569;
  background: #f8fafc;
}

.bench-status--running,
.bench-status--success {
  border-color: #bbf7d0;
  color: #166534;
  background: #f0fdf4;
}

.bench-status--failure,
.bench-status--error {
  border-color: #fecaca;
  color: #b42318;
  background: #fff7f7;
}

.bench-path {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  word-break: break-all;
}

.bench-meta {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.bench-meta dt {
  font-size: 11px;
  color: #64748b;
}

.bench-meta dd {
  margin: 2px 0 0;
  color: #1f272e;
  font-size: 13px;
}

.bench-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bench-action {
  min-height: 32px;
  padding: 0 10px;
}

.bench-action--danger {
  border-color: #fca5a5;
  color: #912018;
  background: #fff7f7;
}

.bench-logs-panel {
  border-top: 1px solid #e4e9ef;
  padding-top: 10px;
  display: grid;
  gap: 8px;
}

.bench-logs-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bench-logs-title {
  margin: 0;
  font-size: 13px;
  color: #334155;
}

.bench-logs-filter {
  flex: 1;
}

.bench-logs-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.bench-log-item {
  padding: 8px;
  border-radius: 8px;
  background: #f8fafc;
}

.bench-log-message,
.bench-log-meta {
  margin: 0;
}

.bench-log-meta {
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}
</style>