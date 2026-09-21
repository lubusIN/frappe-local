import { afterEach, describe, expect, it, vi } from 'vitest';

const compiler = vi.hoisted(() => ({ status: 0, stdout: '', stderr: '', signal: null }));
vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => compiler) }));

afterEach(() => vi.restoreAllMocks());

describe('renderer typecheck exit status', () => {
  it.each([
    { status: 0, stdout: '', signal: null, fails: false },
    { status: 1, stdout: 'node_modules/frappe-ui/index.ts(1,1): error TS2304: Missing name', signal: null, fails: false },
    { status: 1, stdout: 'node_modules\\frappe-ui\\index.ts(1,1): error TS2304: Missing name', signal: null, fails: false },
    { status: 1, stdout: 'src/renderer/main.ts(1,1): error TS2304: Missing name', signal: null, fails: true },
    { status: 1, stdout: 'Compiler failed unexpectedly', signal: null, fails: true },
    { status: null, stdout: '', signal: 'SIGTERM', fails: true },
    { status: 1, stdout: 'node_modules/frappe-ui/index.ts(1,1): error TS2304: Missing name\nsrc/renderer/main.ts(1,1): error TS2304: Missing name', signal: null, fails: true },
  ])('handles compiler result %#', async ({ fails, ...result }) => {
    vi.resetModules();
    Object.assign(compiler, result);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('compiler rejected'); });
    // This is a CLI entry point: importing it runs the check with the mocked compiler.
    const check = import('../../scripts/typecheck-renderer.js');
    if (fails) {
      await expect(check).rejects.toThrow('compiler rejected');
      expect(exit).toHaveBeenCalledWith(1);
    } else {
      await check;
      expect(exit).not.toHaveBeenCalled();
    }
  });
});
