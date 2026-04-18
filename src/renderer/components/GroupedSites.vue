<template>
  <div class="grouped-sites">
    <div class="grouped-sites-header">
      <h4 class="grouped-sites-title">Grouped Sites</h4>
      <p class="grouped-sites-count">{{ filteredSites.length }} site(s)</p>
    </div>

    <div v-if="filteredSites.length === 0" class="grouped-sites-empty">
      <p>No sites match the current filters.</p>
      <button type="button" @click="$emit('reset-filters')">Clear filters</button>
    </div>

    <div v-else class="grouped-sites-list">
      <!-- Unassigned sites -->
      <div v-if="unassignedSites.length > 0" class="grouped-sites-section">
        <h5 class="grouped-sites-section-title">
          {{ unassignedSites.length }} Unassigned Site(s)
        </h5>
        <ul class="grouped-sites-items">
          <li v-for="site in unassignedSites" :key="site.id" class="grouped-site-item">
            <div class="grouped-site-info">
              <p class="grouped-site-name">{{ site.name }}</p>
              <p class="grouped-site-status">{{ site.status }}</p>
            </div>
            <div class="grouped-site-actions">
              <button type="button" class="site-action-button" @click="$emit('site-action', 'open', site.id)">
                Open
              </button>
              <button type="button" class="site-action-button" @click="$emit('site-action', 'logs', site.id)">
                Logs
              </button>
            </div>
          </li>
        </ul>
      </div>

      <!-- Grouped sites by workspace -->
      <div v-for="workspace in groupedWorkspaces" :key="workspace.id" class="grouped-sites-section">
        <div class="grouped-sites-section-header">
          <h5 class="grouped-sites-section-title">
            {{ workspace.name }}
            <span class="grouped-sites-section-count">{{ workspace.sitesInGroup.length }} site(s)</span>
          </h5>
          <div class="grouped-sites-section-tags">
            <span v-for="tag in workspace.tags" :key="tag" class="grouped-site-tag">{{ tag }}</span>
            <span v-if="workspace.tags.length === 0" class="grouped-site-tag grouped-site-tag--empty">no tags</span>
          </div>
        </div>
        <ul class="grouped-sites-items">
          <li v-for="site in workspace.sitesInGroup" :key="site.id" class="grouped-site-item">
            <div class="grouped-site-info">
              <p class="grouped-site-name">{{ site.name }}</p>
              <p class="grouped-site-status">{{ site.status }}</p>
            </div>
            <div class="grouped-site-actions">
              <button type="button" class="site-action-button" @click="$emit('site-action', 'open', site.id)">
                Open
              </button>
              <button type="button" class="site-action-button" @click="$emit('site-action', 'logs', site.id)">
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

defineProps<{
  sites: Site[];
  workspaces: Workspace[];
  filteredSites: Site[];
}>();

defineEmits<{
  'site-action': [action: 'open' | 'logs', siteId: string];
  'reset-filters': [];
}>();

const unassignedSites = computed(() => filteredSites.filter((s) => !s.groupId));

const groupedWorkspaces = computed(() => {
  return workspaces.map((ws) => ({
    ...ws,
    sitesInGroup: filteredSites.filter((s) => s.groupId === ws.id),
  }));
});
</script>

<style scoped>
.grouped-sites {
  background: white;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #e0e0e0;
}

.grouped-sites-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #f0e8dc;
}

.grouped-sites-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f1c18;
}

.grouped-sites-count {
  margin: 0;
  font-size: 13px;
  color: #666;
}

.grouped-sites-empty {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.grouped-sites-empty p {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.grouped-sites-empty button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background-color: #6f4f36;
  color: white;
  font-size: 13px;
  cursor: pointer;
}

.grouped-sites-empty button:hover {
  background-color: #5a3f2b;
}

.grouped-sites-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.grouped-sites-section {
  border: 1px solid #e8dcc8;
  border-radius: 6px;
  padding: 16px;
  background-color: #fdfbf7;
}

.grouped-sites-section-header {
  margin-bottom: 16px;
}

.grouped-sites-section-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f1c18;
  display: flex;
  align-items: center;
  gap: 8px;
}

.grouped-sites-section-count {
  font-size: 12px;
  color: #999;
  font-weight: 400;
}

.grouped-sites-section-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.grouped-site-tag {
  display: inline-block;
  padding: 2px 8px;
  background-color: #ede5d5;
  color: #5a4a3a;
  font-size: 11px;
  border-radius: 3px;
}

.grouped-site-tag--empty {
  color: #999;
  background-color: transparent;
  border: 1px dashed #ccc;
}

.grouped-sites-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grouped-site-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.grouped-site-info {
  flex: 1;
}

.grouped-site-name {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #1f1c18;
}

.grouped-site-status {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #666;
  text-transform: capitalize;
}

.grouped-site-actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.site-action-button {
  padding: 6px 12px;
  background-color: #f0e8dc;
  border: 1px solid #d9d1c5;
  border-radius: 4px;
  font-size: 12px;
  color: #5a4a3a;
  cursor: pointer;
  transition: all 0.2s;
}

.site-action-button:hover {
  background-color: #e8dcc8;
  border-color: #c9c1b5;
}

.site-action-button:active {
  background-color: #dcc9b3;
}
</style>
