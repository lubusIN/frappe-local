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

      <RouterView />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { navigationItems } from '../routes';

const route = useRoute();

const currentTitle = computed(() => String(route.meta.title ?? 'Frappe Cafe'));
const currentDescription = computed(() =>
  String(route.meta.description ?? 'The desktop shell is ready for the next feature slice.')
);
</script>