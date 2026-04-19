<template>
  <main class="shell">
    <aside class="sidebar">
      <p class="eyebrow">Frappe Cafe</p>
      <h1 class="brand-title">Local Frappe without terminal-first setup.</h1>

      <nav aria-label="Primary" class="nav-list">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
        >
          <span class="nav-link-title">{{ item.label }}</span>
          <span class="nav-link-body">{{ item.description }}</span>
        </RouterLink>
      </nav>
    </aside>

    <section class="content">
      <header class="topbar">
        <div>
          <h2 class="topbar-title">{{ currentTitle }}</h2>
          <p class="topbar-body">{{ currentDescription }}</p>
        </div>
      </header>

      <section v-if="showIpcWarning" class="ipc-warning" role="alert">
        <p class="ipc-warning__eyebrow">Renderer connection issue</p>
        <h3 class="ipc-warning__title">Desktop services are unavailable</h3>
        <p class="ipc-warning__body">
          The preload bridge did not initialize, so data loading and local actions cannot run yet.
          The tabs should still render, but any runtime-backed action will show an error until the Electron preload connection is fixed.
        </p>
      </section>

      <RouterView />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { isIpcBridgeAvailable } from '../composables/useIpc';
import { navigationItems } from '../routes';

const route = useRoute();
const showIpcWarning = computed(() => !isIpcBridgeAvailable());

const currentTitle = computed(() => String(route.meta.title ?? 'Frappe Cafe'));
const currentDescription = computed(() =>
  String(route.meta.description ?? 'The desktop shell is ready for the next feature slice.')
);
</script>

<style scoped>
.ipc-warning {
  margin-bottom: 20px;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid rgba(150, 57, 57, 0.22);
  background: linear-gradient(145deg, rgba(255, 241, 238, 0.96), rgba(255, 250, 247, 0.98));
}

.ipc-warning__eyebrow,
.ipc-warning__title,
.ipc-warning__body {
  margin: 0;
}

.ipc-warning__eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a04d4d;
}

.ipc-warning__title {
  margin-top: 6px;
  font-size: 20px;
  color: #512626;
}

.ipc-warning__body {
  margin-top: 8px;
  color: #724040;
  line-height: 1.6;
}
</style>