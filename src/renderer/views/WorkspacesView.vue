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

    <StatePanel
      v-if="error"
      kind="error"
      title="Unable to load workspaces"
      :body="error"
      action-label="Retry"
      @action="refresh"
    />
    <p v-if="successMessage" class="workspaces-success">{{ successMessage }}</p>

    <form v-if="!loading" class="workspaces-form" @submit.prevent="onCreateWorkspace">
      <label class="workspaces-field">
        <span>Name</span>
        <input v-model="createForm.name" type="text" required />
      </label>
      <label class="workspaces-field workspaces-field--full">
        <span>Description</span>
        <input v-model="createForm.description" type="text" placeholder="Workspace description" />
      </label>
      <label class="workspaces-field workspaces-field--full">
        <span>Tags (comma separated)</span>
        <input v-model="createForm.tagsText" type="text" placeholder="client-a, production" />
      </label>
      <div class="workspaces-actions workspaces-field--full">
        <button type="submit" class="workspaces-create" :disabled="loading">Create workspace</button>
      </div>
    </form>

    <StatePanel
      v-else-if="loading"
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

        <div class="workspace-assignment">
          <select v-model="assignmentSelection[workspace.id]">
            <option value="">Assign site</option>
            <option v-for="site in assignableSites(workspace.id)" :key="site.id" :value="site.id">
              {{ site.name }}
            </option>
          </select>
          <button type="button" class="workspace-action" @click="onAssignSite(workspace.id)">Assign</button>
        </div>

        <ul class="workspace-assigned-sites">
          <li v-for="site in assignedSites(workspace.id)" :key="site.id">
            <span>{{ site.name }}</span>
            <button type="button" class="workspace-action workspace-action--subtle" @click="onUnassignSite(site.id)">
              Remove
            </button>
          </li>
        </ul>

        <div class="workspace-card-actions">
          <button type="button" class="workspace-action" @click="onEditWorkspace(workspace.id)">Edit</button>
          <button type="button" class="workspace-action workspace-action--danger" @click="onDeleteWorkspace(workspace.id, workspace.name)">
            Delete
          </button>
        </div>
      </li>
    </ul>

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
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
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