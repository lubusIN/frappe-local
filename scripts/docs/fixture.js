// Runs inside Chromium before the renderer bootstraps. All data stays in memory.
export function installScreenshotFixture({ version }) {
  localStorage.clear();
  localStorage.setItem('theme', 'light');
  const timestamp = '2026-09-14T09:00:00.000Z';
  const settings = {
    defaultFrappeVersion: 'version-16', storagePath: '/Users/demo/Frappe',
    editorPreference: 'code', terminalPreference: 'default', updateChannel: 'stable',
    autoUpdateEnabled: true, sidebarCompact: false, podmanMemoryMb: 12288,
    shareSshKeys: false, theme: 'light', breweryUrl: 'https://frappe-brewery.lubus.in/',
  };
  const benches = [{
    id: 'demo-bench-001', name: 'development', path: '/Users/demo/Frappe/development',
    frappeVersion: 'version-16', httpPort: 8080, status: 'running', appCount: 1,
    apps: ['frappe'], createdAt: timestamp, updatedAt: timestamp,
  }];
  const sites = [{
    id: 'demo-site-001', name: 'demo.localhost', benchId: benches[0].id,
    path: `${benches[0].path}/sites/demo.localhost`, status: 'ready',
    apps: ['frappe'], appCount: 1, createdAt: timestamp, updatedAt: timestamp,
  }];
  // Show the second installation stage without running a real install.
  if (new URL(window.location.href).searchParams.get('scenario') === 'site-apps') {
    benches[0].apps.push('erpnext');
    benches[0].appCount = 2;
  }
  const catalog = [{
    id: 'erpnext', name: 'erpnext', title: 'ERPNext',
    description: 'Open source ERP for your business.',
    source: 'https://github.com/frappe/erpnext', version: 'version-16',
    category: 'business', compatibility: {},
  }];
  const report = {
    checks: [
      { type: 'storage-access', status: 'passed', title: 'Storage directory', description: 'Storage directory is accessible.', timestamp },
      { type: 'runtime-health', status: 'passed', title: 'Podman runtime', description: 'The managed environment is running.', timestamp },
    ], hasCriticalIssues: false, hasWarnings: false,
    summary: 'Example environment is ready.', completedAt: timestamp, appVersion: version,
  };
  // Completed example activity stays deterministic with the capture clock.
  localStorage.setItem('frappe-local:activities', JSON.stringify([{
    taskId: 'demo-migration', taskName: 'Migrate site demo.localhost',
    status: 'success', type: 'task.completed', message: 'Migration completed.',
    stepName: null, createdAt: '2026-09-14T08:59:00.000Z', timestamp,
    errorCode: null, resource: 'site', resourceId: sites[0].id,
    logs: [
      { message: 'Starting migration for demo.localhost', timestamp: '2026-09-14T08:59:00.000Z', level: 'info', stepId: 'migrate', stepName: 'Migrate site', type: 'task.step.started' },
      { message: 'Updating DocTypes for frappe', timestamp: '2026-09-14T08:59:30.000Z', level: 'info', stepId: 'migrate', stepName: 'Migrate site', type: 'task.log' },
      { message: 'Migration completed.', timestamp, level: 'info', stepId: 'migrate', stepName: 'Migrate site', type: 'task.step.completed' },
    ],
  }]));
  const methods = {
    listBenches: () => benches,
    listSites: () => sites,
    listCatalog: () => catalog,
    listCustomApps: () => [],
    getSettings: () => settings,
    setSettings: updates => Object.assign(settings, updates),
    checkAppHealth: () => ({
      appName: 'Frappe Local', platform: 'darwin', nodeVersion: '22', electronVersion: '35', timestamp,
    }),
    getSystemResources: () => ({
      totalMemoryMb: 16384, recommendedPodmanMemoryMb: 12288, podmanMachineRequired: true,
    }),
    getFrontDoorStatus: () => ({ available: true, secure: true }),
    getLastDiagnosticsReport: () => report,
    checkEditorInstalled: () => true,
    getAvailableTerminals: () => [{ id: 'default', name: 'Default' }],
    pathExists: () => false,
    listBenchLogs: () => [],
    listSiteLogs: () => [],
    readTaskLog: () => '',
    checkAppUsage: () => ({ inUse: false, benches: [], sites: [] }),
    uiReady: () => true,
    subscribeTaskRunnerEvents: () => true,
    unsubscribeTaskRunnerEvents: () => true,
  };
  window.__screenshotErrors = [];
  window.frappeLocal = new Proxy({}, {
    get: (_, key) => {
      // Event subscriptions return an unsubscribe function; no runtime events occur.
      if (typeof key === 'string' && key.startsWith('on')) return () => () => {};
      return async (...args) => {
        if (Object.hasOwn(methods, key)) return structuredClone(methods[key](...args));
        window.__screenshotErrors.push(String(key));
        throw new Error(`Screenshot fixture does not implement ${String(key)}`);
      };
    },
  });
}
