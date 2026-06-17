import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { buildStartupErrorHtml, createBootstrapContext } from '../../../src/main/bootstrap';

describe('startup bootstrap', () => {
  it('creates a startup context with resolved runtime paths', () => {
    const context = createBootstrapContext(
      'Frappe Local',
      '0.1.0',
      async () => undefined,
      {
        getPath: (name) => {
          if (name === 'userData') {
            return '/tmp/frappe-local-user';
          }

          return '/tmp/frappe-local-logs';
        },
      }
    );

    expect(context.runtimePaths.userDataPath).toBe('/tmp/frappe-local-user');
    expect(context.runtimePaths.logsPath).toBe('/tmp/frappe-local-logs');
    expect(context.runtimePaths.configPath.endsWith(`${path.sep}config`)).toBe(true);
    expect(context.runtimePaths.storagePath.endsWith(`${path.sep}storage`)).toBe(true);
  });

  it('renders startup fallback html with app name', () => {
    const html = buildStartupErrorHtml('Frappe Local');

    expect(html).toContain('Frappe Local could not finish startup.');
    expect(html).toContain('initialization error');
  });
});