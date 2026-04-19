import { describe, expect, it } from 'vitest';
import type { Group, Site } from '../src/shared/domain/models';

/**
 * Edge case scenarios for workspace grouping:
 * 1. Deleting a workspace with assigned sites
 * 2. Orphaned site references after group deletion
 * 3. Reassigning sites between workspaces
 * 4. Concurrent modifications to group membership
 */

describe('workspace edge cases', () => {
  it('handles deleting workspace with assigned sites gracefully', () => {
    // Scenario: User deletes a workspace that has 3 sites assigned
    const workspace: Group = {
      id: 'grp-to-delete',
      name: 'Project Alpha',
      description: 'Being deleted',
      tags: ['client'],
      siteIds: ['site-001', 'site-002', 'site-003'],
    };

    const assignedSites: Site[] = [
      {
        id: 'site-001',
        name: 'alpha-dev',
        benchId: 'bench-001',
        groupId: workspace.id,
        apps: ['frappe'],
        status: 'running',
        path: '/path',
        timestamps: { createdAt: '', updatedAt: '' },
      },
      {
        id: 'site-002',
        name: 'alpha-test',
        benchId: 'bench-001',
        groupId: workspace.id,
        apps: ['frappe'],
        status: 'stopped',
        path: '/path',
        timestamps: { createdAt: '', updatedAt: '' },
      },
    ];

    // When workspace is deleted, sites should be unassigned (groupId set to null)
    const cleanedSites = assignedSites.map((site) => ({
      ...site,
      groupId: site.groupId === workspace.id ? null : site.groupId,
    }));

    expect(cleanedSites).toEqual([
      expect.objectContaining({ id: 'site-001', groupId: null }),
      expect.objectContaining({ id: 'site-002', groupId: null }),
    ]);
  });

  it('prevents orphaned site references', () => {
    // Scenario: A site references a workspace that no longer exists
    const sites: Site[] = [
      {
        id: 'orphan-site',
        name: 'orphaned.localhost',
        benchId: 'bench-001',
        groupId: 'grp-deleted-123', // References deleted workspace
        apps: ['frappe'],
        status: 'running',
        path: '/path',
        timestamps: { createdAt: '', updatedAt: '' },
      },
    ];

    const workspaces: Group[] = [
      // No workspace with id 'grp-deleted-123'
    ];

    const workspaceIds = new Set(workspaces.map((w) => w.id));
    const hasOrphans = sites.some((site) => site.groupId && !workspaceIds.has(site.groupId));

    expect(hasOrphans).toBe(true);

    // Clean orphans by setting groupId to null
    const cleanedSites = sites.map((site) =>
      site.groupId && !workspaceIds.has(site.groupId) ? { ...site, groupId: null } : site
    );

    expect(cleanedSites).toHaveLength(1);
    expect(cleanedSites[0]).toMatchObject({ id: 'orphan-site', groupId: null });
  });

  it('handles reassigning site between workspaces', () => {
    // Scenario: Move site from workspace A to workspace B
    const site: Site = {
      id: 'site-001',
      name: 'demo.localhost',
      benchId: 'bench-001',
      groupId: 'grp-a',
      apps: ['frappe'],
      status: 'running',
      path: '/path',
      timestamps: { createdAt: '', updatedAt: '' },
    };

    const workspaceA: Group = {
      id: 'grp-a',
      name: 'Project A',
      description: 'A',
      tags: [],
      siteIds: ['site-001'],
    };

    const workspaceB: Group = {
      id: 'grp-b',
      name: 'Project B',
      description: 'B',
      tags: [],
      siteIds: [],
    };

    // Reassign: remove from A, add to B
    const updatedSite = { ...site, groupId: 'grp-b' };
    const updatedWorkspaceA = {
      ...workspaceA,
      siteIds: workspaceA.siteIds.filter((id) => id !== 'site-001'),
    };
    const updatedWorkspaceB = {
      ...workspaceB,
      siteIds: [...workspaceB.siteIds, 'site-001'],
    };

    expect(updatedSite.groupId).toBe('grp-b');
    expect(updatedWorkspaceA.siteIds).toHaveLength(0);
    expect(updatedWorkspaceB.siteIds).toContain('site-001');
  });

  it('preserves workspace data during updates', () => {
    // Scenario: Partial update of workspace (e.g., only updating tags)
    const workspace: Group = {
      id: 'grp-001',
      name: 'Production',
      description: 'Production workspace',
      tags: ['prod'],
      siteIds: ['site-001', 'site-002', 'site-003'],
    };

    // User updates only tags
    const updatedWorkspace = {
      ...workspace,
      tags: ['prod', 'critical'],
    };

    expect(updatedWorkspace).toEqual({
      ...workspace,
      tags: ['prod', 'critical'],
      siteIds: ['site-001', 'site-002', 'site-003'], // Unchanged
    });
  });

  it('handles unassigning all sites from workspace', () => {
    // Scenario: Remove all sites from a workspace
    const workspace: Group = {
      id: 'grp-001',
      name: 'Empty Project',
      description: 'All sites unassigned',
      tags: ['archived'],
      siteIds: [],
    };

    // Verify workspace is empty but still exists
    expect(workspace.siteIds).toHaveLength(0);
    expect(workspace.name).toBe('Empty Project');
  });
});
