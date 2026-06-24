import type { RouteRecordRaw } from 'vue-router';
import ActivityView from '@frappe-local/renderer/views/ActivityView.vue';
import BenchesView from '@frappe-local/renderer/views/BenchesView.vue';
import DashboardView from '@frappe-local/renderer/views/DashboardView.vue';
import { appRouteDefinitions, navigationItems } from '@frappe-local/renderer/router/navigation';
import SitesView from '@frappe-local/renderer/views/SitesView.vue';
const componentMap = {
  dashboard: DashboardView,
  activity: ActivityView,
  benches: BenchesView,
  sites: SitesView,
  diagnostics: () => import('@frappe-local/renderer/views/DiagnosticsView.vue'),
  customApps: () => import('@frappe-local/renderer/views/CustomAppsView.vue'),
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
