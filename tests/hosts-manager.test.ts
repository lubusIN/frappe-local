import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const execPromiseMock = vi.fn();

vi.mock('node:fs', () => ({
  default: {
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
    writeFileSync: (...args: unknown[]) => writeFileSyncMock(...args),
  },
}));

vi.mock('../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

describe('hosts manager localhost behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileSyncMock.mockReturnValue('127.0.0.1 localhost\n');
    writeFileSyncMock.mockImplementation(() => undefined);
    execPromiseMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  });

  it('skips writing hosts entry for .localhost domains', async () => {
    const { addHostsEntry } = await import('../src/main/hosts-manager');

    const result = await addHostsEntry('demo.localhost', 'bench-1');

    expect(result).toBe(true);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(execPromiseMock).not.toHaveBeenCalled();
  });

  it('adds hosts entry for non-localhost domains', async () => {
    const { addHostsEntry } = await import('../src/main/hosts-manager');

    const result = await addHostsEntry('demo.local', 'bench-2');

    expect(result).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalled();
    expect(execPromiseMock).toHaveBeenCalledWith('osascript', [
      '-e',
      expect.stringContaining('Action: Add host entry for demo.local.'),
    ]);
  });

  it('skips removing hosts entry for .localhost domains', async () => {
    const { removeHostsEntry } = await import('../src/main/hosts-manager');

    const result = await removeHostsEntry('demo.localhost');

    expect(result).toBe(true);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(execPromiseMock).not.toHaveBeenCalled();
  });
});
