import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectAvailableTerminals, openBenchShell, openSiteShell } from '../../../src/main/utils/terminal';

const mockExec = vi.fn((cmd: string, cb?: ((error: unknown, result: { stdout: string; stderr: string }) => void)) => {
  if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
  return {} as unknown as ReturnType<typeof import('node:child_process')['exec']>;
});
const mockSpawn = vi.fn((_executable: string, _args: string[], _options: Record<string, unknown>) => {
  void _executable;
  void _args;
  void _options;
  const listeners: Record<string, () => void> = {};
  queueMicrotask(() => listeners.spawn?.());
  return {
    once: (event: string, callback: () => void) => {
      listeners[event] = callback;
    },
    unref: vi.fn(),
  };
});

vi.mock('node:child_process', () => ({
  exec: (cmd: string, cb?: ((error: unknown, result: { stdout: string; stderr: string }) => void)) => mockExec(cmd, cb),
  spawn: (executable: string, args: string[], options: Record<string, unknown>) => mockSpawn(executable, args, options),
}));

describe('terminal utilities', () => {
  beforeEach(() => {
    mockExec.mockClear();
    mockSpawn.mockClear();
  });

  it('detects available terminals and always includes System Default', async () => {
    const terminals = await detectAvailableTerminals();
    expect(Array.isArray(terminals)).toBe(true);
    expect(terminals.length).toBeGreaterThanOrEqual(1);
    expect(terminals[0]).toEqual({ id: 'default', name: 'System Default' });
  });

  it('uses specified terminal preference when opening bench shell', async () => {
    if (process.platform === 'darwin') {
      await openBenchShell('/tmp/bench', 'test-proj', {}, 'iTerm');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('osascript'), expect.anything());
    }
    if (process.platform === 'win32') {
      await openBenchShell('C:\\Benches\\Bench With Spaces', 'test-proj', {
        DOCKER_HOST: 'npipe:////./pipe/podman-test',
        DOCKER_CONFIG: 'C:\\Temp\\docker config',
      }, 'wt.exe');
      expect(mockSpawn).toHaveBeenCalledWith(
        'wt.exe',
        expect.arrayContaining(['-d', 'C:\\Benches\\Bench With Spaces', 'cmd.exe', '/k', 'call']),
        expect.objectContaining({ cwd: 'C:\\Benches\\Bench With Spaces', detached: true })
      );
      const terminalArgs = mockSpawn.mock.calls[0]![1];
      const script = readFileSync(terminalArgs.at(-1) as string, 'utf8');
      expect(script).toContain('cd /d "C:\\Benches\\Bench With Spaces"');
      expect(script).toContain('wsl.exe -d podman-frappe-local -u user -- /usr/local/bin/enterns /usr/bin/env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/podman exec -it');
      expect(script).toContain('"test-proj-frappe-1" /bin/bash');
      expect(script).not.toContain('docker-compose');
    }
  });

  it('falls back to default terminal command when preference is default', async () => {
    if (process.platform === 'darwin') {
      await openBenchShell('/tmp/bench', 'test-proj', {}, 'default');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('osascript'), expect.anything());
    }
    if (process.platform === 'win32') {
      await openBenchShell('C:\\Bench', 'test-proj', {}, 'default');
      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd.exe',
        expect.arrayContaining(['/d', '/k', 'call']),
        expect.objectContaining({ cwd: 'C:\\Bench', detached: true })
      );
    }
  });

  it('handles custom terminal binary commands', async () => {
    if (process.platform === 'darwin') {
      await openBenchShell('/tmp/bench', 'test-proj', {}, '/usr/local/bin/my-term');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('open -a "/usr/local/bin/my-term"'), expect.anything());
    }
  });

  it('uses specified terminal preference when opening site shell', async () => {
    if (process.platform === 'darwin') {
      await openSiteShell('/tmp/bench', 'test-proj', 'site1.local', {}, 'iTerm');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('osascript'), expect.anything());
    }
    if (process.platform === 'win32') {
      await openSiteShell('C:\\Bench', 'test-proj', 'site1.local', {}, 'powershell.exe');
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell.exe',
        expect.arrayContaining(['-NoExit', '-Command']),
        expect.objectContaining({ cwd: 'C:\\Bench', detached: true })
      );
      const terminalArgs = mockSpawn.mock.calls[0]![1];
      const scriptPath = terminalArgs.at(-1)?.match(/& '(.+)'/)?.[1] ?? '';
      expect(scriptPath).not.toBe('');
      const script = readFileSync(scriptPath, 'utf8');
      expect(script).toContain('-e "FRAPPE_SITE=site1.local" "test-proj-frappe-1" /bin/bash');
    }
  });
});
