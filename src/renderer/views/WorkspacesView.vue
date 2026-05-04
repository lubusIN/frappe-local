<template>
  <section class="workspaces-view">


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
      v-if="!loading && (sites || []).length === 0"
      title="Workspaces become useful after your first site"
      body="This screen groups sites by project or client. You can create a workspace now, but it becomes meaningful once there are sites to assign."
      :links="workspaceSetupLinks"
      compact
    />

    <Dialog
      v-model="showCreateModal"
      :options="{ title: 'Create new workspace', size: 'lg' }"
    >
      <template #body-content>
        <form class="form-body-compact" @submit.prevent="onCreateWorkspace">
          <div class="form-grid-dialog">
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
          </div>
        </form>
      </template>
      <template #actions>
        <div class="dialog-actions">
          <Button theme="gray" variant="subtle" @click="showCreateModal = false">Cancel</Button>
          <Button variant="solid" :loading="loading" @click="onCreateWorkspace">Create workspace</Button>
        </div>
      </template>
    </Dialog>

    <StatePanel
      v-if="loading"
      kind="loading"
      title="Loading workspaces"
      body="Pulling group assignments and workspace summaries."
    />

    <section v-if="!error && !loading && (workspaces || []).length === 0" class="bench-empty-state">
      <div class="bench-empty-state__content">
        <h2 class="bench-empty-state__title">No workspaces yet</h2>
        <p class="bench-empty-state__description">Create groups to organize sites by project or client.</p>
        <div class="bench-empty-state__actions">
          <Button variant="solid" @click="showCreateModal = true">Create</Button>
        </div>
      </div>
    </section>

    <!-- Workspace list -->
    <div v-if="!error && !loading && (workspaces || []).length > 0" class="activity-list-container">
      <ListView
        :columns="workspaceColumns"
        :rows="workspaces"
        row-key="id"
        :options="workspaceListOptions"
      >
        <template #default>
          <ListHeader class="activity-list-header" />
          <ListRows class="activity-list-rows" />
        </template>

        <template #cell="{ column, row }">
          <template v-if="column.key === 'name'">
            <div class="list-col">
              <p class="list-col__primary">{{ row.name }}</p>
            </div>
          </template>
          <template v-else-if="column.key === 'description'">
            <span class="cell-text cell-text--secondary">{{ row.description || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'tags'">
            <div class="flex flex-wrap gap-1">
              <Badge
                v-for="tag in (row.tags || [])"
                :key="tag"
                theme="gray"
                variant="subtle"
                size="sm"
              >
                {{ tag }}
              </Badge>
              <span v-if="!(row.tags && row.tags.length)" class="text-xs text-gray-400">—</span>
            </div>
          </template>
          <template v-else-if="column.key === 'sites'">
            <Badge theme="gray" variant="solid" size="md">
              {{ row.siteCount }} sites
            </Badge>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="list-col list-col--actions">
              <Dropdown :options="getWorkspaceActions(row)">
                <template #default>
                  <button class="btn btn--subtle btn--sm">
                    <IconMoreHorizontal class="w-4 h-4" />
                  </button>
                </template>
              </Dropdown>
            </div>
          </template>
        </template>
      </ListView>
    </div>

    <Dialog
      v-model="showAssignmentModal"
      :options="{ title: 'Manage Workspace Assignments', size: 'xl' }"
    >
      <template #body-content>
        <div v-if="activeWorkspaceId" class="assignment-panel">
          <div v-if="(assignableSites(activeWorkspaceId) || []).length > 0" class="workspace-assign flex items-center gap-2 py-4 border-b border-gray-100 mb-4">
            <select v-model="assignmentSelection[activeWorkspaceId]" class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none">
              <option value="">Select a site to assign…</option>
              <option v-for="site in (assignableSites(activeWorkspaceId) || [])" :key="site.id" :value="site.id">
                {{ site.name }}
              </option>
            </select>
            <Button theme="gray" variant="solid" @click="onAssignSite(activeWorkspaceId)">Assign</Button>
          </div>
          <div v-else class="py-6 mb-4 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
            <p class="text-sm text-gray-500 mb-3">All sites are already assigned or no sites exist.</p>
            <Button variant="subtle" size="sm" @click="router.push('/sites')">Manage Sites</Button>
          </div>

          <div class="assigned-section">
            <h5 class="text-sm font-semibold mb-3">Assigned Sites</h5>
            <div v-if="!assignedSites(activeWorkspaceId)?.length" class="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded">
              No sites assigned to this workspace yet.
            </div>
            <ul v-else class="assigned-list">
              <li v-for="site in assignedSites(activeWorkspaceId)" :key="site.id" class="assigned-item">
                <span class="assigned-item__name">{{ site.name }}</span>
                <div class="assigned-item__actions">
                  <Button
                    v-if="site.status === 'running'"
                    variant="subtle"
                    size="sm"
                    @click="ipc.openExternal(`http://${site.name}:8080`)"
                  >
                    View
                  </Button>
                  <Button variant="subtle" size="sm" theme="red" @click="onUnassignSite(site.id)">Remove</Button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </template>
      <template #actions>
        <div class="flex justify-end w-full">
          <Button theme="gray" variant="subtle" @click="showAssignmentModal = false">Close</Button>
        </div>
      </template>
    </Dialog>
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
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Badge, Button, Dialog, Dropdown, ListView, ListHeader, ListRows } from 'frappe-ui';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconPlus from '~icons/lucide/plus';
import IconCheckCircle from '~icons/lucide/check-circle';
import IconMoreHorizontal from '~icons/lucide/more-horizontal';
import IconPencil from '~icons/lucide/pencil';
import IconTrash from '~icons/lucide/trash-2';
import IconLink from '~icons/lucide/link';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import FirstRunGuide, { type FirstRunGuideLink } from '../components/FirstRunGuide.vue';
import StatePanel from '../components/StatePanel.vue';
import { useWorkspaces } from '../composables/useWorkspaces';
import { usePageHeaderActions } from '../composables/usePageHeaderActions';
import { useIpc } from '../composables/useIpc';
import { useRouter } from 'vue-router';

const ipc = useIpc();
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

const { setActions: setPageHeaderActions, clearActions: clearPageHeaderActions } = usePageHeaderActions();
const router = useRouter();

const workspaceColumns = [
  { key: 'name', label: 'Workspace', width: '200px' },
  { key: 'description', label: 'Description', width: 'minmax(200px, 1fr)' },
  { key: 'tags', label: 'Tags', width: '200px' },
  { key: 'sites', label: 'Sites', width: '100px' },
  { key: 'actions', label: '', width: '60px' },
];

const workspaceListOptions = {
  selectable: false,
  showTooltip: false,
  rowHeight: '52px',
};

const getWorkspaceActions = (workspace: any) => [
  {
    label: 'Assign Site',
    icon: IconLink,
    onClick: () => onManageAssignments(workspace.id),
  },
  {
    label: 'Edit',
    icon: IconPencil,
    onClick: () => onEditWorkspace(workspace.id),
  },
  {
    label: 'Delete',
    icon: IconTrash,
    theme: 'red',
    onClick: () => onDeleteWorkspace(workspace.id, workspace.name),
  },
];

const showCreateModal = ref(false);
const showAssignmentModal = ref(false);
const activeWorkspaceId = ref<string | null>(null);

const onManageAssignments = (id: string) => {
  activeWorkspaceId.value = id;
  showAssignmentModal.value = true;
};

watch(() => loading.value, () => {
  setPageHeaderActions([
    {
      id: 'workspaces-create',
      label: 'Create',
      variant: 'primary',
      icon: IconPlus,
      onClick: () => {
        showCreateModal.value = true;
      },
    },
    {
      id: 'workspaces-refresh',
      label: loading.value ? 'Refreshing…' : 'Refresh',
      variant: 'subtle',
      disabled: loading.value,
      icon: IconRotateCcw,
      onClick: () => {
        void refresh();
      },
    },
  ]);
}, { immediate: true });

onBeforeUnmount(() => {
  clearPageHeaderActions();
});

const createForm = reactive({
  name: '',
  description: '',
  tagsText: '',
});

const assignmentSelection = ref<Record<string, string>>({});

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

  showCreateModal.value = false;
  createForm.name = '';
  createForm.description = '';
  createForm.tagsText = '';
};

const assignedSites = (workspaceId: string) =>
  computed(() => (sites.value || []).filter((site) => site.groupId === workspaceId)).value;

const assignableSites = (workspaceId: string) =>
  (sites.value || []).filter((site) => !site.groupId || site.groupId === workspaceId);

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

.form-grid-dialog {
  display: grid;
  gap: 16px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-body-compact {
  padding: 4px 0;
}

.activity-list-container {
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.cell-text {
  font-size: 13px;
  line-height: 1.4;
}

.cell-text--secondary {
  color: var(--text-secondary);
}

/* ListView Overrides to match design system */
.activity-list-header {
  background-color: var(--surface-subtle) !important;
  border-bottom: 1px solid var(--border-light) !important;
  margin-bottom: 0 !important;
  padding: 10px 16px !important;
  border-radius: 0 !important;
}

.activity-list-rows {
  padding: 0 !important;
}

:deep(.frappe-list-row) {
  border-bottom: 1px solid var(--border-light) !important;
  padding: 0 16px !important;
  transition: background-color 100ms ease;
  height: 52px !important;
}

:deep(.frappe-list-row:last-child) {
  border-bottom: none !important;
}

:deep(.frappe-list-row:hover) {
  background-color: var(--surface-hover) !important;
}

.bench-empty-state {
  min-height: clamp(300px, 40vh, 500px);
  display: grid;
  place-items: center;
  padding: 24px;
}

.bench-empty-state__content {
  max-width: 520px;
  text-align: center;
}

.bench-empty-state__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
}

.bench-empty-state__description {
  margin: 10px 0 0;
  font-size: 16px;
  line-height: 1.35;
  color: var(--text-secondary);
}

.bench-empty-state__actions {
  margin-top: 24px;
}

.workspaces-view {
  display: grid;
  gap: 16px;
}

.form-grid-dialog {
  display: grid;
  gap: 16px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-body-compact {
  padding: 8px 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-field input,
.form-field select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 100ms ease, box-shadow 100ms ease;
}

.form-field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-light);
}

.form-field--full {
  grid-column: 1 / -1;
}

.list-col__primary {
  margin: 0;
  font-weight: 500;
  color: var(--text-primary);
}

.list-col--actions {
  display: flex;
  justify-content: flex-end;
}
</style>