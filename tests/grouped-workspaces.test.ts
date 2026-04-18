import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useGroupedWorkspaces } from '../src/renderer/composables/useGroupedWorkspaces';

const mockWorkspaces = [
  {
    id: 'grp-001',
    name: 'Client A',
    description: 'Project Alpha',
    tags: ['client', 'production'],
    siteCount: 3,
  },
  {
    id: 'grp-002',
    name: 'Internal',
    description: 'Internal projects',
    tags: ['internal', 'dev'],
    siteCount: 1,
  },
];

const mockSites = [
  {
    id: 'site-001',
    name: 'demo.localhost',
    groupId: 'grp-001',
    status: 'running',
    benchId: 'bench-001',
    apps: ['frappe'],
    path: '/path',
    timestamps: { createdAt: '', updatedAt: '' },
  },
  {
    id: 'site-002',
    name: 'test.localhost',
    groupId: 'grp-001',
    status: 'stopped',
    benchId: 'bench-001',
    apps: ['frappe'],
    path: '/path',
    timestamps: { createdAt: '', updatedAt: '' },
  },
  {
    id: 'site-003',
    name: 'staging.localhost',
    groupId: 'grp-002',
    status: 'running',
    benchId: 'bench-002',
    apps: ['frappe'],
    path: '/path',
    timestamps: { createdAt: '', updatedAt: '' },
  },
  {
    id: 'site-004',
    name: 'dev.localhost',
    groupId: null,
    status: 'running',
    benchId: 'bench-002',
    apps: ['frappe'],
    path: '/path',
    timestamps: { createdAt: '', updatedAt: '' },
  },
];

describe('useGroupedWorkspaces', () => {
  it('provides workspace summaries with site counts', () => {
    const workspaces = ref(mockWorkspaces);
    const sites = ref(mockSites);

    const { workspaceSummaries } = useGroupedWorkspaces(workspaces, sites);

    expect(workspaceSummaries.value).toHaveLength(2);
    expect(workspaceSummaries.value[0]).toMatchObject({
      id: 'grp-001',
      name: 'Client A',
      siteCount: 2,
    });
    expect(workspaceSummaries.value[0].statusSummary).toEqual({
      running: 1,
      stopped: 1,
      queued: 0,
    });
  });

  it('provides grouped sites view with sites nested under workspaces', () => {
    const workspaces = ref(mockWorkspaces);
    const sites = ref(mockSites);

    const { groupedSitesView } = useGroupedWorkspaces(workspaces, sites);

    expect(groupedSitesView.value).toHaveLength(2);
    expect(groupedSitesView.value[0].sitesInGroup).toHaveLength(2);
    expect(groupedSitesView.value[1].sitesInGroup).toHaveLength(1);
  });

  it('counts unassigned sites correctly', () => {
    const workspaces = ref(mockWorkspaces);
    const sites = ref(mockSites);

    const { unassignedSitesCount } = useGroupedWorkspaces(workspaces, sites);

    expect(unassignedSitesCount.value).toBe(1);
  });

  it('identifies most active workspace', () => {
    const workspaces = ref(mockWorkspaces);
    const sites = ref(mockSites);

    const { mostActiveWorkspace } = useGroupedWorkspaces(workspaces, sites);

    expect(mostActiveWorkspace.value).toMatchObject({
      id: 'grp-001',
      name: 'Client A',
    });
  });

  it('handles empty workspace list', () => {
    const workspaces = ref([]);
    const sites = ref(mockSites);

    const { mostActiveWorkspace } = useGroupedWorkspaces(workspaces, sites);

    expect(mostActiveWorkspace.value).toBeNull();
  });
});
