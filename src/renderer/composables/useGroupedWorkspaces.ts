import { computed } from 'vue';
import type { Site } from '../../shared/domain/models';

interface Workspace {
  id: string;
  name: string;
  description: string;
  tags: string[];
  siteCount: number;
}

export function useGroupedWorkspaces(
  workspaces: { value: Workspace[] },
  sites: { value: Site[] }
) {
  // Build workspace summary with counts
  const workspaceSummaries = computed(() => {
    return workspaces.value.map((ws) => {
      const assignedSites = sites.value.filter((s) => s.groupId === ws.id);
      return {
        ...ws,
        siteCount: assignedSites.length,
        statusSummary: {
          running: assignedSites.filter((s) => s.status === 'running').length,
          stopped: assignedSites.filter((s) => s.status === 'stopped').length,
          queued: assignedSites.filter((s) => s.status === 'queued').length,
        },
      };
    });
  });

  // Build grouped site view data
  const groupedSitesView = computed(() => {
    return workspaceSummaries.value.map((ws) => ({
      ...ws,
      sitesInGroup: sites.value.filter((s) => s.groupId === ws.id),
    }));
  });

  // Total unassigned sites count
  const unassignedSitesCount = computed(() => {
    return sites.value.filter((s) => !s.groupId).length;
  });

  // Most active workspace (by site count)
  const mostActiveWorkspace = computed(() => {
    if (workspaceSummaries.value.length === 0) return null;
    return workspaceSummaries.value.reduce((max, ws) =>
      ws.siteCount > max.siteCount ? ws : max
    );
  });

  // Navigation context for remembering last-viewed workspace
  const getNavigationContext = () => {
    return {
      lastViewedWorkspace: localStorage.getItem('lastViewedWorkspace'),
      expandedGroups: localStorage.getItem('expandedGroups')?.split(',') || [],
    };
  };

  const setNavigationContext = (workspaceId: string | null, expandedGroups: string[]) => {
    if (workspaceId) {
      localStorage.setItem('lastViewedWorkspace', workspaceId);
    }
    localStorage.setItem('expandedGroups', expandedGroups.join(','));
  };

  return {
    workspaceSummaries,
    groupedSitesView,
    unassignedSitesCount,
    mostActiveWorkspace,
    getNavigationContext,
    setNavigationContext,
  };
}
