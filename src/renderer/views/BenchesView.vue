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

    <div v-else-if="loading" class="benches-empty">
      <p class="benches-empty-title">Loading benches…</p>
    </div>

    <div v-else-if="benches.length === 0" class="benches-empty">
      <p class="benches-empty-title">No benches yet.</p>
      <p class="benches-empty-body">Create your first bench in the next checkpoint flow.</p>
    </div>

    <ul v-else class="benches-grid">
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
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useBenches } from '../composables/useBenches';

const { benches, loading, error, refresh } = useBenches();
</script>