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

    <div v-else-if="loading" class="sites-empty">
      <p class="sites-empty-title">Loading sites…</p>
    </div>

    <div v-else-if="sites.length === 0" class="sites-empty">
      <p class="sites-empty-title">No sites yet.</p>
      <p class="sites-empty-body">Create your first site in the upcoming lifecycle checkpoint.</p>
    </div>

    <ul v-else class="sites-grid">
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
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useSites } from '../composables/useSites';

const { sites, loading, error, refresh } = useSites();
</script>