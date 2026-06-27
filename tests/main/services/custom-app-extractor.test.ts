import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractCustomApp } from '../../../src/main/services/custom-app-extractor';

const { execGitMock } = vi.hoisted(() => ({
  execGitMock: vi.fn(),
}));

vi.mock('dugite', () => ({
  exec: execGitMock,
}));

const expectGitCommand = (expectedArgs: unknown[]): void => {
  expect(execGitMock.mock.calls.some(([args]) => {
    if (!Array.isArray(args) || args.length !== expectedArgs.length) return false;
    return expectedArgs.every((expectedArg, index) => {
      if (
        expectedArg &&
        typeof expectedArg === 'object' &&
        'asymmetricMatch' in expectedArg &&
        typeof expectedArg.asymmetricMatch === 'function'
      ) {
        return expectedArg.asymmetricMatch(args[index]);
      }
      return args[index] === expectedArg;
    });
  })).toBe(true);
};

describe('Custom App Extractor', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    execGitMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-extractor-test-'));
  });

  it('extracts metadata from a local app', async () => {
    const appDir = path.join(tmpDir, 'test_app');
    fs.mkdirSync(path.join(appDir, 'test_app'), { recursive: true });
    
    // Create setup.py with version and name
    fs.writeFileSync(path.join(appDir, 'setup.py'), `
      name="test_app",
      version="1.0.0",
      description="A test custom app"
    `);

    // Create dummy logo
    fs.mkdirSync(path.join(appDir, 'test_app', 'public'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'test_app', 'public', 'logo.svg'), '<svg></svg>');

    // Create hooks.py with app details
    fs.writeFileSync(path.join(appDir, 'test_app', 'hooks.py'), `
app_name = "test_app"
app_title = "Test App"
app_publisher = "Test Publisher"
app_description = "A test custom app"
    `);
    execGitMock.mockResolvedValue({ exitCode: 0, stdout: 'develop\n', stderr: '' });

    const result = await extractCustomApp('local', appDir);
    expect(result.name).toBe('test_app');
    expect(result.title).toBe('Test App');
    expect(result.description).toBe('A test custom app');
    expect(result.icon).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result.branch).toBe('develop');
    expectGitCommand(['branch', '--show-current']);
  });

  it('extracts metadata from a local app folder with hyphenated repo name', async () => {
    const appDir = path.join(tmpDir, 'frappe-vault');
    fs.mkdirSync(path.join(appDir, 'frappe_vault'), { recursive: true });
    
    fs.mkdirSync(path.join(appDir, 'frappe_vault', 'public', 'images'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'frappe_vault', 'public', 'images', 'vault-logo.svg'), '<svg></svg>');

    fs.writeFileSync(path.join(appDir, 'frappe_vault', 'hooks.py'), `
app_name = "frappe_vault"
app_title = "Frappe Vault"
app_description = "Password and secrets management"
app_logo_url = "/assets/frappe_vault/images/vault-logo.svg"
    `);
    execGitMock.mockResolvedValue({ exitCode: 0, stdout: 'main\n', stderr: '' });

    const result = await extractCustomApp('local', appDir);
    expect(result.name).toBe('frappe_vault');
    expect(result.title).toBe('Frappe Vault');
    expect(result.description).toBe('Password and secrets management');
    expect(result.icon).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('extracts metadata from a github app', async () => {
    execGitMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'ls-remote') {
        return { exitCode: 0, stdout: 'ref: refs/heads/develop\tHEAD\nabc123\tHEAD\n', stderr: '' };
      }
      if (args[0] === 'clone') {
        const dest = args[args.length - 1] as string;
        fs.mkdirSync(path.join(dest, 'github_app'), { recursive: true });
        fs.writeFileSync(path.join(dest, 'setup.py'), `name="github_app"`);
        fs.writeFileSync(path.join(dest, 'github_app', 'hooks.py'), `
app_name = "github_app"
app_title = "GitHub App"
app_description = "App from github"
        `);
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await extractCustomApp('github', 'https://github.com/frappe/github_app.git');
    expect(result.name).toBe('github_app');
    expect(result.title).toBe('GitHub App');
    expect(result.description).toBe('App from github');
    expect(result.icon).toBeUndefined();
    expect(result.branch).toBe('develop');
    expectGitCommand(['ls-remote', '--symref', 'https://github.com/frappe/github_app.git', 'HEAD']);
    expectGitCommand(['clone', '--depth', '1', 'https://github.com/frappe/github_app.git', expect.any(String)]);
  });

  it('passes SSH remotes through to bundled git for private repositories', async () => {
    execGitMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'ls-remote') {
        return { exitCode: 0, stdout: 'ref: refs/heads/main\tHEAD\nabc123\tHEAD\n', stderr: '' };
      }
      if (args[0] === 'clone') {
        const dest = args[args.length - 1] as string;
        fs.mkdirSync(path.join(dest, 'ssh_app'), { recursive: true });
        fs.writeFileSync(path.join(dest, 'ssh_app', 'hooks.py'), 'app_title = "SSH App"');
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await extractCustomApp('github', 'git@github.com:frappe/ssh_app.git');

    expect(result.name).toBe('ssh_app');
    expectGitCommand(['clone', '--depth', '1', 'git@github.com:frappe/ssh_app.git', expect.any(String)]);
  });

  it('falls back to main when default branch lookup fails', async () => {
    execGitMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'ls-remote') {
        return { exitCode: 1, stdout: '', stderr: 'permission denied' };
      }
      if (args[0] === 'clone') {
        const dest = args[args.length - 1] as string;
        fs.mkdirSync(path.join(dest, 'main_app'), { recursive: true });
        fs.writeFileSync(path.join(dest, 'main_app', 'hooks.py'), 'app_title = "Main App"');
      }
      if (args[0] === 'branch') {
        return { exitCode: 0, stdout: 'master\n', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await extractCustomApp('github', 'https://github.com/frappe/main_app.git');

    expect(result.branch).toBe('master');
    expectGitCommand(['clone', '--depth', '1', 'https://github.com/frappe/main_app.git', expect.any(String)]);
    expectGitCommand(['branch', '--show-current']);
  });

  it('throws error if local path does not exist', async () => {
    const appDir = path.join(tmpDir, 'invalid_app');

    await expect(extractCustomApp('local', appDir)).rejects.toThrow('Local path does not exist:');
  });
});
