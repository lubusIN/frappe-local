import type { RouteRecordRaw } from 'vue-router';
import ActivityView from '../views/ActivityView.vue';
import BenchesView from '../views/BenchesView.vue';
import DashboardView from '../views/DashboardView.vue';
import { appRouteDefinitions, navigationItems } from './navigation';
import SitesView from '../views/SitesView.vue';
const componentMap = {
  dashboard: DashboardView,
  activity: ActivityView,
  benches: BenchesView,
  sites: SitesView,
  diagnostics: () => import('../views/DiagnosticsView.vue'),
  customApps: () => import('../views/CustomAppsView.vue'),
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
