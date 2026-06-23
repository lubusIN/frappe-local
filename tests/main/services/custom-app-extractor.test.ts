import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractCustomApp } from '../../../src/main/services/custom-app-extractor';
import { execPromise } from '../../../src/main/utils/exec';

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: vi.fn(),
}));

describe('Custom App Extractor', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
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

    const result = await extractCustomApp('local', appDir);
    expect(result.name).toBe('test_app');
    expect(result.title).toBe('Test App');
    expect(result.description).toBe('A test custom app');
    expect(result.icon).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('extracts metadata from a github app', async () => {
    // Mock execPromise to simulate cloning
    vi.mocked(execPromise).mockImplementation(async (cmd, args, cwd) => {
      if (cmd === 'git' && args[0] === 'clone') {
        const dest = args[args.length - 1] as string;
        fs.mkdirSync(path.join(dest, 'github_app'), { recursive: true });
        fs.writeFileSync(path.join(dest, 'setup.py'), `name="github_app"`);
        fs.writeFileSync(path.join(dest, 'github_app', 'hooks.py'), `
app_name = "github_app"
app_title = "GitHub App"
app_description = "App from github"
        `);
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await extractCustomApp('github', 'https://github.com/frappe/github_app.git');
    expect(result.name).toBe('github_app');
    expect(result.title).toBe('GitHub App');
    expect(result.description).toBe('App from github');
    expect(result.icon).toBeUndefined();
    expect(execPromise).toHaveBeenCalledWith('git', expect.arrayContaining(['clone', '--depth', '1', 'https://github.com/frappe/github_app.git']));
  });

  it('throws error if local path does not exist', async () => {
    const appDir = path.join(tmpDir, 'invalid_app');

    await expect(extractCustomApp('local', appDir)).rejects.toThrow('Local path does not exist:');
  });
});
