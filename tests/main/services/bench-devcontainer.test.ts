import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBenchDevcontainer } from '../../../src/main/services/bench-orchestration';

describe('ensureBenchDevcontainer', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frappe-local-devcontainer-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .devcontainer/devcontainer.json, wrapper scripts, and .vscode/settings.json', async () => {
    const logs: string[] = [];
    const context = {
      log: (_level: string, message: string) => {
        logs.push(message);
      },
    };

    await ensureBenchDevcontainer(tmpDir, context as any, 'setup', { DOCKER_HOST: 'unix:///tmp/test.sock' });

    const devcontainerDir = path.join(tmpDir, '.devcontainer');
    const devcontainerFile = path.join(devcontainerDir, 'devcontainer.json');
    const dockerBin = path.join(devcontainerDir, 'bin', process.platform === 'win32' ? 'docker.bat' : 'docker');
    const composeBin = path.join(devcontainerDir, 'bin', process.platform === 'win32' ? 'docker-compose.bat' : 'docker-compose');
    const settingsFile = path.join(tmpDir, '.vscode', 'settings.json');

    expect(fs.existsSync(devcontainerFile)).toBe(true);
    expect(fs.existsSync(dockerBin)).toBe(true);
    expect(fs.existsSync(composeBin)).toBe(true);
    expect(fs.existsSync(settingsFile)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(devcontainerFile, 'utf8'));
    expect(parsed.name).toBe('Frappe Local Bench');
    expect(parsed.service).toBe('frappe');
    expect(parsed.workspaceFolder).toBe('/workspace');
    expect(parsed.customizations.vscode.settings['python.defaultInterpreterPath']).toBe('/workspace/env/bin/python');
    expect(parsed.customizations.vscode.extensions).toContain('ms-python.python');

    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    expect(settings['dev.containers.dockerPath']).toBe(dockerBin);
    expect(settings['dev.containers.dockerComposePath']).toBe(composeBin);
    expect(logs).toHaveLength(0);
  });
});
