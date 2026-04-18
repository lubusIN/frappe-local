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

    <p v-if="error" class="benches-error">{{ error }}</p>
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
        <span>Apps (comma separated)</span>
        <input v-model="createForm.appsText" type="text" placeholder="frappe, erpnext" />
      </label>
      <div class="benches-actions benches-field--full">
        <button class="benches-create" type="submit" :disabled="creating || loading">
          {{ creating ? 'Creating…' : 'Create bench' }}
        </button>
      </div>
    </form>

    <div v-if="!error && loading" class="benches-empty">
      <p class="benches-empty-title">Loading benches…</p>
    </div>

    <div v-if="!error && !loading && benches.length === 0" class="benches-empty">
      <p class="benches-empty-title">No benches yet.</p>
      <p class="benches-empty-body">Create your first bench in the next checkpoint flow.</p>
    </div>

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
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useBenches } from '../composables/useBenches';

const { benches, loading, creating, updating, deleting, error, successMessage, create, update, remove, refresh } = useBenches();

const createForm = reactive({
  name: '',
  path: '',
  frappeVersion: '15.0.0',
  runtime: 'docker' as 'docker' | 'podman',
  appsText: '',
});

const onCreateBench = async () => {
  const apps = createForm.appsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  await create({
    name: createForm.name,
    path: createForm.path,
    frappeVersion: createForm.frappeVersion,
    runtime: createForm.runtime,
    apps,
  });

  createForm.name = '';
  createForm.path = '';
  createForm.appsText = '';
};

const onSetBenchStatus = async (id: string, status: 'running' | 'stopped') => {
  await update(id, { status });
};

const onDeleteBench = async (id: string, name: string) => {
  const confirmed = window.confirm(`Delete bench ${name}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  await remove(id);
};
</script>