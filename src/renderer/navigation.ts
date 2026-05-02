export type AppRouteDefinition = {
  readonly path: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
};

export type NavigationItem = {
  readonly label: string;
  readonly description: string;
  readonly path: string;
};

export const appRouteDefinitions: AppRouteDefinition[] = [
  {
    path: '/',
    name: 'dashboard',
    title: 'Dashboard',
    description: 'The control center for first-run setup, recent activity, and quick actions.',
  },
  {
    path: '/activity',
    name: 'activity',
    title: 'Activity',
    description: 'Recent tasks and long-running operations across benches, sites, runtime, and imports.',
  },
  {
    path: '/benches',
    name: 'benches',
    title: 'Benches',
    description: 'Track bench creation, runtime state, and the actions users will rely on most.',
  },
  {
    path: '/sites',
    name: 'sites',
    title: 'Sites',
    description: 'Prepare the management surface for site creation, assignment, and health visibility.',
  },
  {
    path: '/workspaces',
    name: 'workspaces',
    title: 'Workspaces',
    description: 'Group sites by project and keep the navigation model ready for scale.',
  },
  {
    path: '/console',
    name: 'console',
    title: 'Console',
    description: 'Reserve an intentional home for embedded terminal sessions and tool integration.',
  },
  {
    path: '/import-export',
    name: 'importExport',
    title: 'Import / Export',
    description: 'Validate export packages, map them to benches, and preview import conflicts safely.',
  },
  {
    path: '/diagnostics',
    name: 'diagnostics',
    title: 'Diagnostics',
    description: 'Monitor system health and fix runtime issues.',
  },
];

export const navigationItems: NavigationItem[] = [
  {
    label: 'Dashboard',
    description: 'See quick actions, recent activity, and environment health.',
    path: '/',
  },
  {
    label: 'Benches',
    description: 'Manage bench lifecycle, versions, and logs.',
    path: '/benches',
  },
  {
    label: 'Sites',
    description: 'View and control the sites attached to each bench.',
    path: '/sites',
  },
  {
    label: 'Workspaces',
    description: 'Organize projects by client, project, or custom tags.',
    path: '/workspaces',
  },
  {
    label: 'Console',
    description: 'Launch scoped commands once terminal support lands.',
    path: '/console',
  },
  {
    label: 'Import / Export',
    description: 'Validate packages, preview mappings, and prepare safe transfers.',
    path: '/import-export',
  },
  {
    label: 'Activity',
    description: 'Recent tasks and long-running operations.',
    path: '/activity',
  },
  {
    label: 'Diagnostics',
    description: 'Check Podman status and system health.',
    path: '/diagnostics',
  },
];