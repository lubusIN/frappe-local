import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { TerminalService, getTerminalService, resetTerminalService } from '../src/main/terminal-service';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  readonly kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.emit('close', signal === 'SIGKILL' ? 9 : 0);
    return true;
  });
}

const createService = () => {
  const children: FakeChildProcess[] = [];
  const spawnCalls: Array<{ command: string; args: string[]; options: SpawnOptionsWithoutStdio }> = [];

  const service = new TerminalService({
    shellPath: '/bin/mock-shell',
    shellArgs: ['-i'],
    fileExists: (workspacePath) => workspacePath.startsWith('/Users/example'),
    spawnProcess: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      const child = new FakeChildProcess();
      children.push(child);
      return child as unknown as ChildProcessWithoutNullStreams;
    },
  });

  return { service, children, spawnCalls };
};

describe('TerminalService', () => {
  it('singleton returns same instance', () => {
    resetTerminalService();
    const service1 = getTerminalService();
    const service2 = getTerminalService();
    expect(service1).toBe(service2);
    resetTerminalService();
  });

  it('creates a process-backed session with a valid workspace path', () => {
    const { service, spawnCalls } = createService();

    const result = service.createSession({
      benchId: 'bench-one',
      siteId: 'site-one',
      workspacePath: '/Users/example/frappe-bench/sites/site-one',
    });

    expect(result.success).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session?.state).toBe('ready');
    expect(result.session?.workingDirectory).toBe('/Users/example/frappe-bench/sites/site-one');
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.command).toBe('/bin/mock-shell');
    expect(spawnCalls[0]?.options.cwd).toBe('/Users/example/frappe-bench/sites/site-one');
  });

  it('rejects invalid bench identifiers', () => {
    const { service } = createService();

    const result = service.createSession({
      benchId: '../bench',
      siteId: null,
      workspacePath: '/Users/example/frappe-bench',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid terminal context');
  });

  it('rejects missing working directories', () => {
    const { service } = createService();

    const result = service.createSession({
      benchId: 'bench-one',
      siteId: null,
      workspacePath: '/Users/missing/frappe-bench',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Working directory does not exist');
  });

  it('writes input to the running process', async () => {
    const { service, children } = createService();
    const result = service.createSession({
      benchId: 'bench-one',
      siteId: null,
      workspacePath: '/Users/example/frappe-bench',
    });

    const received: string[] = [];
    children[0]?.stdin.on('data', (chunk) => {
      received.push(chunk.toString());
    });

    const wrote = service.write(result.session!.id, 'bench start\n');

    await new Promise((resolve) => setImmediate(resolve));
    expect(wrote).toBe(true);
    expect(received).toEqual(['bench start\n']);
  });

  it('emits output events from stdout', async () => {
    const { service, children } = createService();
    const events: string[] = [];
    service.onOutput((event) => {
      events.push(event.output);
    });

    service.createSession({
      benchId: 'bench-one',
      siteId: null,
      workspacePath: '/Users/example/frappe-bench',
    });

    children[0]?.stdout.write('hello from shell\n');
    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toContain('hello from shell\n');
  });

  it('emits stderr as both output and terminal errors', async () => {
    const { service, children } = createService();
    const outputs: string[] = [];
    const errors: string[] = [];

    service.onOutput((event) => {
      outputs.push(event.output);
    });
    service.onError((event) => {
      errors.push(event.message);
    });

    service.createSession({
      benchId: 'bench-one',
      siteId: null,
      workspacePath: '/Users/example/frappe-bench',
    });

    children[0]?.stderr.write('permission denied\n');
    await new Promise((resolve) => setImmediate(resolve));

    expect(outputs).toContain('permission denied\n');
    expect(errors).toContain('permission denied\n');
  });

  it('emits state transitions for ready and closed sessions', async () => {
    const { service } = createService();
    const transitions: string[] = [];

    service.onStateChange((event) => {
      transitions.push(`${event.previousState}->${event.newState}`);
    });

    const result = service.createSession({
      benchId: 'bench-one',
      siteId: null,
      workspacePath: '/Users/example/frappe-bench',
    });

    service.closeSession(result.session!.id);
    await new Promise((resolve) => setImmediate(resolve));

    expect(transitions).toContain('connecting->ready');
    expect(transitions).toContain('ready->closed');
  });

  it('removes a session after process close', async () => {
    const { service } = createService();
    const result = service.createSession({
      benchId: 'bench-one',
      siteId: null,
      workspacePath: '/Users/example/frappe-bench',
    });

    expect(service.getSession(result.session!.id)).not.toBeNull();
    service.closeSession(result.session!.id);
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.getSession(result.session!.id)).toBeNull();
  });

  it('validates sessions created with absolute paths', () => {
    const { service } = createService();
    const result = service.createSession({
      benchId: 'bench-one',
      siteId: null,
      workspacePath: '/Users/example/frappe-bench',
    });

    expect(service.isSessionValid(result.session!.id)).toBe(true);
  });

  it('returns false when closing unknown sessions', () => {
    const { service } = createService();
    expect(service.closeSession('terminal-missing')).toBe(false);
  });
});
