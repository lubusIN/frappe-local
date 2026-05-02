<template>
  <section class="workspaces-view">
    <header class="view-header">
      <h2 class="view-header__title">Workspaces</h2>
      <div class="view-header__actions">
        <button type="button" class="btn btn--subtle" @click="refresh" :disabled="loading">
          <IconRotateCcw class="btn-icon" />
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load workspaces"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />

    <div v-if="successMessage" class="alert alert--success">
      <IconCheckCircle class="alert-icon" />
      {{ successMessage }}
    </div>

    <FirstRunGuide
      v-if="!loading && sites.length === 0"
      title="Workspaces become useful after your first site"
      body="This screen groups sites by project or client. You can create a workspace now, but it becomes meaningful once there are sites to assign."
      :steps="workspaceSetupSteps"
      :links="workspaceSetupLinks"
      compact
    />

    <!-- Create form -->
    <div v-if="!loading" class="form-card">
      <h3 class="form-card__title">Create new workspace</h3>
      <form class="form-grid" @submit.prevent="onCreateWorkspace">
        <label class="form-field">
          <span class="form-label">Name</span>
          <input v-model="createForm.name" type="text" required placeholder="Project Alpha" />
        </label>
        <label class="form-field form-field--full">
          <span class="form-label">Description</span>
          <input v-model="createForm.description" type="text" placeholder="Workspace description" />
        </label>
        <label class="form-field form-field--full">
          <span class="form-label">Tags (comma separated)</span>
          <input v-model="createForm.tagsText" type="text" placeholder="client-a, production" />
        </label>
        <div class="form-actions form-field--full">
          <button type="submit" class="btn btn--primary" :disabled="loading">Create workspace</button>
        </div>
      </form>
    </div>

    <StatePanel
      v-if="loading"
      kind="loading"
      title="Loading workspaces"
      body="Pulling group assignments and workspace summaries."
    />

    <StatePanel
      v-else-if="workspaces.length === 0"
      kind="empty"
      title="No workspaces yet"
      body="Create groups to organize sites by project or client."
    />

    <!-- Workspace list -->
    <div v-if="!loading && workspaces.length > 0" class="workspace-list">
      <article v-for="workspace in workspaces" :key="workspace.id" class="workspace-card">
        <div class="workspace-card__header">
          <div>
            <h4 class="workspace-card__name">{{ workspace.name }}</h4>
            <p class="workspace-card__desc">{{ workspace.description || 'No description' }}</p>
          </div>
          <div class="workspace-card__meta">
            <span class="meta-badge">{{ workspace.siteCount }} site(s)</span>
          </div>
        </div>

        <div class="workspace-tags">
          <span v-for="tag in workspace.tags" :key="tag" class="tag-pill">{{ tag }}</span>
          <span v-if="workspace.tags.length === 0" class="tag-pill tag-pill--empty">no tags</span>
        </div>

        <div class="workspace-assign">
          <select v-model="assignmentSelection[workspace.id]" class="workspace-assign__select">
            <option value="">Assign site…</option>
            <option v-for="site in assignableSites(workspace.id)" :key="site.id" :value="site.id">
              {{ site.name }}
            </option>
          </select>
          <button type="button" class="btn btn--subtle btn--sm" @click="onAssignSite(workspace.id)">Assign</button>
        </div>

        <ul v-if="assignedSites(workspace.id).length > 0" class="assigned-list">
          <li v-for="site in assignedSites(workspace.id)" :key="site.id" class="assigned-item">
            <span class="assigned-item__name">{{ site.name }}</span>
            <div class="assigned-item__actions">
              <a
                v-if="site.status === 'running'"
                :href="`http://${site.name}:8080`"
                target="_blank"
                class="btn btn--subtle btn--sm"
                rel="noopener noreferrer"
              >
                View
              </a>
              <button type="button" class="btn btn--subtle btn--sm" @click="onUnassignSite(site.id)">Remove</button>
            </div>
          </li>
        </ul>

        <div class="workspace-card__actions">
          <button type="button" class="btn btn--subtle btn--sm" @click="onEditWorkspace(workspace.id)">Edit</button>
          <button type="button" class="btn btn--danger btn--sm" @click="onDeleteWorkspace(workspace.id, workspace.name)">Delete</button>
        </div>
      </article>
    </div>

    <ConfirmationDialog
      :open="deleteConfirmOpen"
      title="Delete workspace"
      :message="`Delete workspace ${pendingDeleteWorkspaceName}? Assigned sites will be ungrouped.`"
      confirm-label="Delete workspace"
      @cancel="onCancelDeleteWorkspace"
      @confirm="onConfirmDeleteWorkspace"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconCheckCircle from '~icons/lucide/check-circle';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import FirstRunGuide, { type FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import StatePanel from '../components/StatePanel.vue';
import { useWorkspaces } from '../composables/useWorkspaces';

const {
  workspaces,
  sites,
  loading,
  error,
  successMessage,
  create,
  update,
  remove,
  assignSite,
  unassignSite,
  refresh,
} = useWorkspaces();

const createForm = reactive({
  name: '',
  description: '',
  tagsText: '',
});

const assignmentSelection = ref<Record<string, string>>({});
const workspaceSetupSteps = computed(() => [
  'Create a bench and at least one site so workspaces have something to organize.',
  'Create a workspace for each client, project, or environment boundary you care about.',
  'Assign sites into those workspaces so filtered navigation becomes useful.',
]);
const workspaceSetupLinks = computed<FirstRunGuideLink[]>(() => [
  { label: 'Create a site', to: '/sites' },
  { label: 'Manage benches', to: '/benches' },
]);

const onCreateWorkspace = async () => {
  const tags = createForm.tagsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  await create({
    name: createForm.name,
    description: createForm.description,
    tags,
  });

  createForm.name = '';
  createForm.description = '';
  createForm.tagsText = '';
};

const assignedSites = (workspaceId: string) =>
  computed(() => sites.value.filter((site) => site.groupId === workspaceId)).value;

const assignableSites = (workspaceId: string) =>
  sites.value.filter((site) => !site.groupId || site.groupId === workspaceId);

const onAssignSite = async (workspaceId: string) => {
  const siteId = assignmentSelection.value[workspaceId];
  if (!siteId) {
    return;
  }

  await assignSite(workspaceId, siteId);
  assignmentSelection.value[workspaceId] = '';
};

const onUnassignSite = async (siteId: string) => {
  await unassignSite(siteId);
};

const onEditWorkspace = async (workspaceId: string) => {
  const existing = workspaces.value.find((workspace) => workspace.id === workspaceId);
  if (!existing) {
    return;
  }

  const name = window.prompt('Workspace name', existing.name);
  if (!name) {
    return;
  }

  const description = window.prompt('Workspace description', existing.description) ?? existing.description;
  const tagsText = window.prompt('Tags (comma separated)', existing.tags.join(', ')) ?? existing.tags.join(', ');

  await update(workspaceId, {
    name,
    description,
    tags: tagsText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  });
};

const deleteConfirmOpen = ref(false);
const pendingDeleteWorkspaceId = ref<string | null>(null);
const pendingDeleteWorkspaceName = ref('');

const onDeleteWorkspace = async (workspaceId: string, name: string) => {
  pendingDeleteWorkspaceId.value = workspaceId;
  pendingDeleteWorkspaceName.value = name;
  deleteConfirmOpen.value = true;
};

const onCancelDeleteWorkspace = (): void => {
  deleteConfirmOpen.value = false;
  pendingDeleteWorkspaceId.value = null;
  pendingDeleteWorkspaceName.value = '';
};

const onConfirmDeleteWorkspace = async (): Promise<void> => {
  const workspaceId = pendingDeleteWorkspaceId.value;
  if (!workspaceId) {
    onCancelDeleteWorkspace();
    return;
  }

  deleteConfirmOpen.value = false;
  await remove(workspaceId);
  onCancelDeleteWorkspace();
};
</script>

<style scoped>
.workspaces-view {
  display: grid;
  gap: 16px;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.view-header__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.view-header__actions {
  display: flex;
  gap: 8px;
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
  white-space: nowrap;
}

.btn:hover:not(:disabled) { background: var(--surface-hover); }
.btn--subtle { border-color: var(--border-default); }
.btn--primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn--primary:hover:not(:disabled) { background: var(--primary-hover); }
.btn--danger { border-color: var(--red-border); color: var(--red-text); background: var(--surface-card); }
.btn--danger:hover:not(:disabled) { background: var(--red-light); }
.btn--sm { min-height: 24px; padding: 0 8px; font-size: 11px; }

/* Alert */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.alert--success {
  color: var(--green-text);
  background: var(--green-light);
  border: 1px solid var(--green-border);
}

/* Form card */
.form-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.form-card__title {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  padding: 16px;
}

.form-field { display: grid; gap: 4px; }
.form-field--full { grid-column: 1 / -1; }
.form-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.form-actions { display: flex; gap: 8px; padding-top: 4px; }

/* Workspace list */
.workspace-list {
  display: grid;
  gap: 12px;
}

.workspace-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--surface-card);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.workspace-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.workspace-card__name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-card__desc {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.meta-badge {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--surface-subtle);
}

.workspace-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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

.workspace-assign {
  display: flex;
  gap: 8px;
}

.workspace-assign__select {
  flex: 1;
  min-height: 24px;
  font-size: 12px;
}

.assigned-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.assigned-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--surface-subtle);
}

.assigned-item__name {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
}

.assigned-item__actions {
  display: flex;
  gap: 4px;
}

.workspace-card__actions {
  display: flex;
  gap: 4px;
  border-top: 1px solid var(--border-light);
  padding-top: 12px;
}
</style>