import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppRuntimePaths } from '../src/main/config';

describe('runtime path resolver', () => {
  it('builds deterministic config and storage stub paths', () => {
    const resolved = resolveAppRuntimePaths({
      getPath: (name) => {
        if (name === 'userData') {
          return '/tmp/local-bench-user';
        }

        return '/tmp/local-bench-logs';
      },
    });

    expect(resolved).toEqual({
      userDataPath: '/tmp/local-bench-user',
      logsPath: '/tmp/local-bench-logs',
      configPath: path.join('/tmp/local-bench-user', 'config'),
      storagePath: path.join('/tmp/local-bench-user', 'storage'),
    });
  });
});