<template>
  <section class="sites-view">
    <header class="sites-header">
      <div>
        <p class="card-eyebrow">Site Management</p>
        <h3 class="sites-title">Local sites</h3>
      </div>
      <button type="button" class="sites-refresh" @click="refresh" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="error" class="sites-error">{{ error }}</p>
    <p v-if="successMessage" class="sites-success">{{ successMessage }}</p>

    <form class="sites-form" @submit.prevent="onCreateSite">
      <label class="sites-field">
        <span>Name</span>
        <input v-model="createForm.name" type="text" required />
      </label>
      <label class="sites-field">
        <span>Bench ID</span>
        <input v-model="createForm.benchId" type="text" required />
      </label>
      <label class="sites-field sites-field--full">
        <span>Path</span>
        <input v-model="createForm.path" type="text" required />
      </label>
      <label class="sites-field">
        <span>Group ID (optional)</span>
        <input v-model="createForm.groupId" type="text" />
      </label>
      <label class="sites-field">
        <span>Apps (comma separated)</span>
        <input v-model="createForm.appsText" type="text" placeholder="frappe, erpnext" />
      </label>
      <div class="sites-actions sites-field--full">
        <button class="sites-create" type="submit" :disabled="creating || loading">
          {{ creating ? 'Creating…' : 'Create site' }}
        </button>
      </div>
    </form>

    <div v-if="!error && loading" class="sites-empty">
      <p class="sites-empty-title">Loading sites…</p>
    </div>

    <div v-if="!error && !loading && sites.length === 0" class="sites-empty">
      <p class="sites-empty-title">No sites yet.</p>
      <p class="sites-empty-body">Create your first site in the upcoming lifecycle checkpoint.</p>
    </div>

    <ul v-if="!error && !loading && sites.length > 0" class="sites-grid">
      <li v-for="site in sites" :key="site.id" class="site-card">
        <div class="site-card-top">
          <h4 class="site-name">{{ site.name }}</h4>
          <span class="site-status" :class="`site-status--${site.status}`">{{ site.status }}</span>
        </div>
        <p class="site-path">{{ site.path }}</p>
        <dl class="site-meta">
          <div>
            <dt>Bench</dt>
            <dd>{{ site.benchId }}</dd>
          </div>
          <div>
            <dt>Group</dt>
            <dd>{{ site.groupId ?? 'None' }}</dd>
          </div>
          <div>
            <dt>Apps</dt>
            <dd>{{ site.appCount }}</dd>
          </div>
        </dl>
        <div class="site-card-actions">
          <button
            class="site-action"
            type="button"
            :disabled="updating || site.status === 'running'"
            @click="onSetSiteStatus(site.id, 'running')"
          >
            Start
          </button>
          <button
            class="site-action"
            type="button"
            :disabled="updating || site.status === 'stopped'"
            @click="onSetSiteStatus(site.id, 'stopped')"
          >
            Stop
          </button>
          <button
            class="site-action site-action--danger"
            type="button"
            :disabled="updating || deleting || site.status === 'running'"
            @click="onDeleteSite(site.id, site.name)"
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
import { useSites } from '../composables/useSites';

const { sites, loading, creating, updating, deleting, error, successMessage, create, update, remove, refresh } = useSites();

const createForm = reactive({
  name: '',
  benchId: '',
  groupId: '',
  path: '',
  appsText: '',
});

const onCreateSite = async () => {
  const apps = createForm.appsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  await create({
    name: createForm.name,
    benchId: createForm.benchId,
    groupId: createForm.groupId.trim() ? createForm.groupId.trim() : null,
    path: createForm.path,
    apps,
  });

  createForm.name = '';
  createForm.benchId = '';
  createForm.groupId = '';
  createForm.path = '';
  createForm.appsText = '';
};

const onSetSiteStatus = async (id: string, status: 'running' | 'stopped') => {
  await update(id, { status });
};

const onDeleteSite = async (id: string, name: string) => {
  const confirmed = window.confirm(`Delete site ${name}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  await remove(id);
};
</script>