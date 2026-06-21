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
    path: '/sites',
    name: 'sites',
    title: 'Sites',
    description: 'Prepare the management surface for site creation, assignment, and health visibility.',
  },
  {
    path: '/benches',
    name: 'benches',
    title: 'Benches',
    description: 'Track bench creation, runtime state, and the actions users will rely on most.',
  },
  {
    path: '/custom-apps',
    name: 'customApps',
    title: 'My Apps',
    description: 'Manage your custom Frappe apps from GitHub or local directories.',
  },
  {
    path: '/activity',
    name: 'activity',
    title: 'Activity',
    description: 'Recent tasks and long-running operations across benches, sites, runtime, and system jobs.',
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
    label: 'Sites',
    description: 'View and control the sites attached to each bench.',
    path: '/sites',
  },
  {
    label: 'Benches',
    description: 'Manage bench lifecycle, versions, and logs.',
    path: '/benches',
  },
  {
    label: 'My Apps',
    description: 'Manage custom apps.',
    path: '/custom-apps',
  },
  {
    label: 'Activity',
    description: 'Track recent and long-running operations.',
    path: '/activity',
  },
  {
    label: 'Diagnostics',
    description: 'Check Podman status and system health.',
    path: '/diagnostics',
  },
];
