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