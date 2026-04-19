<template>
  <div class="grouped-sites">
    <div class="grouped-sites__header">
      <h4 class="grouped-sites__title">Grouped Sites</h4>
      <p class="grouped-sites__count">{{ filteredSites.length }} site(s)</p>
    </div>

    <div v-if="filteredSites.length === 0" class="empty-state">
      <p>No sites match the current filters.</p>
      <button type="button" class="btn btn--subtle" @click="$emit('reset-filters')">Clear filters</button>
    </div>

    <div v-else class="grouped-sites__list">
      <!-- Unassigned sites -->
      <div v-if="unassignedSites.length > 0" class="group-section">
        <h5 class="group-section__title">
          {{ unassignedSites.length }} Unassigned Site(s)
        </h5>
        <ul class="group-section__items">
          <li v-for="site in unassignedSites" :key="site.id" class="group-item">
            <div class="group-item__info">
              <p class="group-item__name">{{ site.name }}</p>
              <p class="group-item__status">{{ site.status }}</p>
            </div>
            <div class="group-item__actions">
              <button type="button" class="btn btn--subtle btn--sm" @click="$emit('site-action', 'open', site.id)">
                Open
              </button>
              <button type="button" class="btn btn--subtle btn--sm" @click="$emit('site-action', 'logs', site.id)">
                Logs
              </button>
            </div>
          </li>
        </ul>
      </div>

      <!-- Grouped sites by workspace -->
      <div v-for="workspace in groupedWorkspaces" :key="workspace.id" class="group-section">
        <div class="group-section__header">
          <h5 class="group-section__title">
            {{ workspace.name }}
            <span class="group-section__count">{{ workspace.sitesInGroup.length }} site(s)</span>
          </h5>
          <div class="group-section__tags">
            <span v-for="tag in workspace.tags" :key="tag" class="tag-pill">{{ tag }}</span>
            <span v-if="workspace.tags.length === 0" class="tag-pill tag-pill--empty">no tags</span>
          </div>
        </div>
        <ul class="group-section__items">
          <li v-for="site in workspace.sitesInGroup" :key="site.id" class="group-item">
            <div class="group-item__info">
              <p class="group-item__name">{{ site.name }}</p>
              <p class="group-item__status">{{ site.status }}</p>
            </div>
            <div class="group-item__actions">
              <button type="button" class="btn btn--subtle btn--sm" @click="$emit('site-action', 'open', site.id)">
                Open
              </button>
              <button type="button" class="btn btn--subtle btn--sm" @click="$emit('site-action', 'logs', site.id)">
                Logs
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Site } from '../../shared/domain/models';

interface Workspace {
  id: string;
  name: string;
  description: string;
  tags: string[];
  siteCount: number;
}

const props = defineProps<{
  sites: Site[];
  workspaces: Workspace[];
  filteredSites: Site[];
}>();

defineEmits<{
  'site-action': [action: 'open' | 'logs', siteId: string];
  'reset-filters': [];
}>();

const unassignedSites = computed(() => props.filteredSites.filter((s) => !s.groupId));

const groupedWorkspaces = computed(() => {
  return props.workspaces.map((ws) => ({
    ...ws,
    sitesInGroup: props.filteredSites.filter((s) => s.groupId === ws.id),
  }));
});
</script>

<style scoped>
.grouped-sites {
  background: var(--surface-card);
  border-radius: 8px;
  padding: 16px;
  border: 1px solid var(--border-light);
}

.grouped-sites__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
}

.grouped-sites__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.grouped-sites__count {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-state p {
  margin: 0 0 12px 0;
  font-size: 13px;
}

.grouped-sites__list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.group-section {
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 16px;
  background-color: var(--surface-bg);
}

.group-section__header {
  margin-bottom: 16px;
}

.group-section__title {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-section__count {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 400;
}

.group-section__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.tag-pill {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.tag-pill--empty {
  color: var(--text-muted);
  border-style: dashed;
}

.group-section__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  border-radius: 6px;
}

.group-item__info {
  flex: 1;
}

.group-item__name {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.group-item__status {
  margin: 2px 0 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.group-item__actions {
  display: flex;
  gap: 6px;
  margin-left: 12px;
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
}

.btn:hover:not(:disabled) { background: var(--surface-hover); }
.btn--subtle { border-color: var(--border-default); }
.btn--sm { min-height: 24px; padding: 0 8px; font-size: 11px; }
</style>
