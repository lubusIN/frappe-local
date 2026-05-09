import { describe, expect, it } from 'vitest';
import { buildStartupErrorHtml, createBootstrapContext } from '../src/main/bootstrap';

describe('startup bootstrap', () => {
  it('creates a startup context with resolved runtime paths', () => {
    const context = createBootstrapContext(
      'Local Bench',
      '0.1.0',
      async () => undefined,
      {
        getPath: (name) => {
          if (name === 'userData') {
            return '/tmp/local-bench-user';
          }

          return '/tmp/local-bench-logs';
        },
      }
    );

    expect(context.runtimePaths.userDataPath).toBe('/tmp/local-bench-user');
    expect(context.runtimePaths.logsPath).toBe('/tmp/local-bench-logs');
    expect(context.runtimePaths.configPath.endsWith('/config')).toBe(true);
    expect(context.runtimePaths.storagePath.endsWith('/storage')).toBe(true);
  });

  it('renders startup fallback html with app name', () => {
    const html = buildStartupErrorHtml('Local Bench');

    expect(html).toContain('Local Bench could not finish startup.');
    expect(html).toContain('initialization error');
  });
});