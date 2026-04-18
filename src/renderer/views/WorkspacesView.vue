<template>
  <section class="workspaces-view">
    <header class="workspaces-header">
      <div>
        <p class="card-eyebrow">Organization</p>
        <h3 class="workspaces-title">Workspaces</h3>
      </div>
      <button type="button" class="workspaces-refresh" @click="refresh" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="error" class="workspaces-error">{{ error }}</p>

    <div v-else-if="loading" class="workspaces-empty">
      <p class="workspaces-empty-title">Loading workspaces…</p>
    </div>

    <div v-else-if="workspaces.length === 0" class="workspaces-empty">
      <p class="workspaces-empty-title">No workspaces yet.</p>
      <p class="workspaces-empty-body">Create groups to organize sites by project or client.</p>
    </div>

    <ul v-else class="workspaces-grid">
      <li v-for="workspace in workspaces" :key="workspace.id" class="workspace-card">
        <h4 class="workspace-name">{{ workspace.name }}</h4>
        <p class="workspace-description">{{ workspace.description || 'No description' }}</p>
        <div class="workspace-meta">
          <span class="workspace-sites">{{ workspace.siteCount }} site(s)</span>
          <div class="workspace-tags">
            <span v-for="tag in workspace.tags" :key="tag" class="workspace-tag">{{ tag }}</span>
            <span v-if="workspace.tags.length === 0" class="workspace-tag workspace-tag--empty">no tags</span>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useWorkspaces } from '../composables/useWorkspaces';

const { workspaces, loading, error, refresh } = useWorkspaces();
</script>