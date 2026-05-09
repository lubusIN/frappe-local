import { describe, expect, it } from 'vitest';
import { isAppHealthResponse, ipcChannels } from '../src/shared/ipc';

describe('ipc contract', () => {
  it('uses a stable channel name for app health checks', () => {
    expect(ipcChannels.appHealthCheck).toBe('app:health:check');
  });

  it('uses a stable channel name for benches listing', () => {
    expect(ipcChannels.benchesList).toBe('benches:list');
  });

  it('uses a stable channel name for bench creation', () => {
    expect(ipcChannels.benchesCreate).toBe('benches:create');
  });

  it('uses a stable channel name for bench update', () => {
    expect(ipcChannels.benchesUpdate).toBe('benches:update');
  });

  it('uses a stable channel name for bench delete', () => {
    expect(ipcChannels.benchesDelete).toBe('benches:delete');
  });

  it('uses stable channel names for bench logs and folder actions', () => {
    expect(ipcChannels.benchesLogs).toBe('benches:logs');
    expect(ipcChannels.benchesOpenFolder).toBe('benches:open-folder');
  });

  it('uses a stable channel name for sites listing', () => {
    expect(ipcChannels.sitesList).toBe('sites:list');
  });

  it('uses a stable channel name for site creation', () => {
    expect(ipcChannels.sitesCreate).toBe('sites:create');
  });

  it('uses a stable channel name for site update', () => {
    expect(ipcChannels.sitesUpdate).toBe('sites:update');
  });

  it('uses a stable channel name for site delete', () => {
    expect(ipcChannels.sitesDelete).toBe('sites:delete');
  });

  it('uses stable channel names for site logs and folder actions', () => {
    expect(ipcChannels.sitesLogs).toBe('sites:logs');
    expect(ipcChannels.sitesOpenFolder).toBe('sites:open-folder');
  });

  it('uses stable channel names for settings operations', () => {
    expect(ipcChannels.settingsGet).toBe('settings:get');
    expect(ipcChannels.settingsSet).toBe('settings:set');
  });

  it('uses stable task runner channel names', () => {
    expect(ipcChannels.taskRunnerSubscribe).toBe('task-runner:subscribe');
    expect(ipcChannels.taskRunnerUnsubscribe).toBe('task-runner:unsubscribe');
    expect(ipcChannels.taskRunnerProgressEvent).toBe('task-runner:progress-event');
  });

  it('uses a stable channel name for diagnostics nuke action', () => {
    expect(ipcChannels.diagnosticsNukeDevState).toBe('diagnostics:nuke-dev-state');
  });



  it('validates app health payload shape', () => {
    const validPayload = {
      appName: 'Frappe Cafe',
      platform: 'darwin',
      nodeVersion: '24.14.0',
      electronVersion: '35.1.5',
      timestamp: new Date().toISOString(),
    };

    const invalidPayload = {
      ...validPayload,
      platform: 42,
    };

    expect(isAppHealthResponse(validPayload)).toBe(true);
    expect(isAppHealthResponse(invalidPayload)).toBe(false);
  });
});
