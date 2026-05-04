import type { RouteRecordRaw } from 'vue-router';
import ActivityView from './views/ActivityView.vue';
import BenchesView from './views/BenchesView.vue';
import ConsoleView from './views/ConsoleView.vue';
import DashboardView from './views/DashboardView.vue';
import ImportExportView from './views/ImportExportView.vue';
import { appRouteDefinitions, navigationItems } from './navigation';
import SitesView from './views/SitesView.vue';
import WorkspacesView from './views/WorkspacesView.vue';

const componentMap = {
  activity: ActivityView,
  dashboard: DashboardView,
  benches: BenchesView,
  sites: SitesView,
  workspaces: WorkspacesView,
  console: ConsoleView,
  importExport: ImportExportView,
  diagnostics: () => import('./views/DiagnosticsView.vue'),
  settings: () => import('./views/SettingsView.vue'),
} as const;

export { navigationItems };

export const routes: RouteRecordRaw[] = appRouteDefinitions.map((definition) => ({
  path: definition.path,
  name: definition.name,
  component: componentMap[definition.name as keyof typeof componentMap],
  meta: {
    title: definition.title,
    description: definition.description,
  },
}));