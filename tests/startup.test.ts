import { describe, expect, it } from 'vitest';
import { buildStartupErrorHtml, createBootstrapContext } from '../src/main/bootstrap';

describe('startup bootstrap', () => {
  it('creates a startup context with resolved runtime paths', () => {
    const context = createBootstrapContext(
      'Frappe Cafe',
      '0.1.0',
      async () => undefined,
      {
        getPath: (name) => {
          if (name === 'userData') {
            return '/tmp/frappe-cafe-user';
          }

          return '/tmp/frappe-cafe-logs';
        },
      }
    );

    expect(context.runtimePaths.userDataPath).toBe('/tmp/frappe-cafe-user');
    expect(context.runtimePaths.logsPath).toBe('/tmp/frappe-cafe-logs');
    expect(context.runtimePaths.configPath.endsWith('/config')).toBe(true);
    expect(context.runtimePaths.storagePath.endsWith('/storage')).toBe(true);
  });

  it('renders startup fallback html with app name', () => {
    const html = buildStartupErrorHtml('Frappe Cafe');

    expect(html).toContain('Frappe Cafe could not finish startup.');
    expect(html).toContain('initialization error');
  });
});