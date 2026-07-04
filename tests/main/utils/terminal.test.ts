import { describe, expect, it, vi, beforeEach } from 'vitest';
import { detectAvailableTerminals, openBenchShell } from '../../../src/main/utils/terminal';

const mockExec = vi.fn((cmd: string, cb?: any) => {
  if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
  return {} as any;
});

vi.mock('node:child_process', () => ({
  exec: (cmd: string, cb?: any) => mockExec(cmd, cb),
}));

describe('terminal utilities', () => {
  beforeEach(() => {
    mockExec.mockClear();
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
  });

  it('falls back to default terminal command when preference is default', async () => {
    if (process.platform === 'darwin') {
      await openBenchShell('/tmp/bench', 'test-proj', {}, 'default');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('osascript'), expect.anything());
    }
  });

  it('handles custom terminal binary commands', async () => {
    if (process.platform === 'darwin') {
      await openBenchShell('/tmp/bench', 'test-proj', {}, '/usr/local/bin/my-term');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('open -a "/usr/local/bin/my-term"'), expect.anything());
    }
  });
});
