import { describe, expect, it } from 'vitest';
import { createDevContainerFolderUri } from '../../../src/main/utils/exec';

describe('editor utilities', () => {
  it('creates a structured Dev Container URI on macOS and Linux', () => {
    const hostPath = '/Users/dev/Frappe Local/bench-one';
    const uri = createDevContainerFolderUri(hostPath, '/workspace/apps/wiki', 'darwin');
    const [encodedAuthority, remotePath] = uri
      .replace('vscode-remote://dev-container+', '')
      .split(/(?=\/workspace)/, 2);
    const authority = JSON.parse(Buffer.from(encodedAuthority!, 'hex').toString('utf8'));

    expect(authority).toMatchObject({
      hostPath,
      localDocker: true,
      configFile: {
        path: '/Users/dev/Frappe Local/bench-one/.devcontainer/devcontainer.json',
        scheme: 'file',
      },
    });
    expect(remotePath).toBe('/workspace/apps/wiki');
  });

  it('creates a structured Windows Dev Container URI', () => {
    const uri = createDevContainerFolderUri(
      'C:\\Users\\dev\\Frappe Local\\bench-one',
      '/workspace/apps/wiki',
      'win32'
    );
    const [encodedAuthority, remotePath] = uri
      .replace('vscode-remote://dev-container+', '')
      .split(/(?=\/workspace)/, 2);
    const authority = JSON.parse(Buffer.from(encodedAuthority!, 'hex').toString('utf8')) as {
      hostPath: string;
      localDocker: boolean;
      configFile: { path: string; scheme: string };
    };

    expect(authority).toMatchObject({
      hostPath: 'C:\\Users\\dev\\Frappe Local\\bench-one',
      localDocker: true,
      configFile: {
        path: '/C:/Users/dev/Frappe Local/bench-one/.devcontainer/devcontainer.json',
        scheme: 'file',
      },
    });
    expect(remotePath).toBe('/workspace/apps/wiki');
  });
});
