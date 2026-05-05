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
  {
    path: '/settings',
    name: 'settings',
    title: 'Settings',
    description: 'Configure application preferences and environment defaults.',
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
  {
    label: 'Settings',
    description: 'Configure app preferences.',
    path: '/settings',
  },
];