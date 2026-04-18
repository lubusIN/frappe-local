import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type {
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalErrorEvent,
  TerminalOutputEvent,
  TerminalSession,
  TerminalSessionId,
  TerminalSessionState,
  TerminalStateChangeEvent,
} from '../shared/domain/terminal-session';
import { createTerminalSessionId } from '../shared/domain/terminal-session';
import type { TerminalContext } from '../shared/domain/terminal-context';
import { buildWorkingDirectory, isScopeValid, validateTerminalContext } from '../shared/domain/terminal-context';

type ManagedTerminalSession = {
  readonly session: TerminalSession;
  readonly process: ChildProcessWithoutNullStreams;
};

type TerminalOutputListener = (event: TerminalOutputEvent) => void;
type TerminalErrorListener = (event: TerminalErrorEvent) => void;
type TerminalStateListener = (event: TerminalStateChangeEvent) => void;

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

type TerminalServiceOptions = {
  readonly shellPath?: string;
  readonly shellArgs?: string[];
  readonly fileExists?: (path: string) => boolean;
  readonly spawnProcess?: SpawnProcess;
};

export class TerminalService {
  private readonly sessions = new Map<TerminalSessionId, ManagedTerminalSession>();
  private readonly outputListeners = new Set<TerminalOutputListener>();
  private readonly errorListeners = new Set<TerminalErrorListener>();
  private readonly stateListeners = new Set<TerminalStateListener>();
  private readonly shellPath: string;
  private readonly shellArgs: string[];
  private readonly fileExists: (path: string) => boolean;
  private readonly spawnProcess: SpawnProcess;

  constructor(options: TerminalServiceOptions = {}) {
    this.shellPath = options.shellPath ?? process.env.SHELL ?? '/bin/zsh';
    this.shellArgs = options.shellArgs ?? ['-i'];
    this.fileExists = options.fileExists ?? existsSync;
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  public onOutput(listener: TerminalOutputListener): () => void {
    this.outputListeners.add(listener);
    return () => {
      this.outputListeners.delete(listener);
    };
  }

  public onError(listener: TerminalErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public onStateChange(listener: TerminalStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public createSession(request: TerminalCreateRequest): TerminalCreateResult {
    const validation = validateTerminalContext(request.benchId, request.siteId ?? null, request.workspacePath);
    if (!validation.valid || !validation.context) {
      return {
        success: false,
        error: `Invalid terminal context: ${validation.errors.join(', ')}`,
      };
    }

    if (!this.fileExists(request.workspacePath)) {
      return {
        success: false,
        error: `Working directory does not exist: ${request.workspacePath}`,
      };
    }

    const sessionId = createTerminalSessionId(`terminal-${randomUUID()}`);
    const baseSession: TerminalSession = {
      id: sessionId,
      state: 'connecting',
      contextBenchId: validation.context.benchId,
      contextSiteId: validation.context.siteId,
      workingDirectory: buildWorkingDirectory(validation.context),
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    try {
      const childProcess = this.spawnProcess(this.shellPath, this.shellArgs, {
        cwd: baseSession.workingDirectory,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
        stdio: 'pipe',
      });

      this.sessions.set(sessionId, { session: baseSession, process: childProcess });
      this.attachProcessListeners(sessionId, childProcess);
      this.emitStateChange(sessionId, 'connecting', 'ready');

      return {
        success: true,
        session: this.getSession(sessionId),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public getSession(sessionId: string): TerminalSession | null {
    const managed = this.sessions.get(createTerminalSessionId(sessionId));
    return managed?.session ?? null;
  }

  public write(sessionId: string, data: string): boolean {
    const managed = this.sessions.get(createTerminalSessionId(sessionId));
    if (!managed) {
      return false;
    }

    managed.process.stdin.write(data);
    this.recordActivity(sessionId);
    return true;
  }

  public clear(sessionId: string): boolean {
    return this.write(sessionId, '\u001bc');
  }

  public resize(sessionId: string, rows: number, cols: number): boolean {
    void rows;
    void cols;
    return this.sessions.has(createTerminalSessionId(sessionId));
  }

  public closeSession(sessionId: string, force = false): boolean {
    const key = createTerminalSessionId(sessionId);
    const managed = this.sessions.get(key);
    if (!managed) {
      return false;
    }

    managed.process.kill(force ? 'SIGKILL' : 'SIGTERM');
    this.recordActivity(sessionId);
    return true;
  }

  public recordActivity(sessionId: string): boolean {
    const key = createTerminalSessionId(sessionId);
    const managed = this.sessions.get(key);
    if (!managed) {
      return false;
    }

    this.sessions.set(key, {
      ...managed,
      session: {
        ...managed.session,
        lastActivityAt: new Date().toISOString(),
      },
    });
    return true;
  }

  public isSessionValid(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const context: TerminalContext = {
      benchId: session.contextBenchId,
      siteId: session.contextSiteId,
      workspacePath: session.workingDirectory,
    };

    return isScopeValid(context);
  }

  public listSessions(): readonly TerminalSession[] {
    return Array.from(this.sessions.values(), (entry) => entry.session);
  }

  public cleanupStaleSessions(timeoutMs = 30 * 60 * 1000): number {
    const now = Date.now();
    const staleSessionIds = this.listSessions()
      .filter((session) => now - new Date(session.lastActivityAt).getTime() > timeoutMs)
      .map((session) => session.id);

    staleSessionIds.forEach((sessionId) => {
      this.closeSession(sessionId, true);
    });

    return staleSessionIds.length;
  }

  private attachProcessListeners(sessionId: TerminalSessionId, childProcess: ChildProcessWithoutNullStreams): void {
    childProcess.stdout.on('data', (chunk: Buffer | string) => {
      this.recordActivity(sessionId);
      this.emitOutput({
        sessionId,
        output: chunk.toString(),
        timestamp: new Date().toISOString(),
      });
    });

    childProcess.stderr.on('data', (chunk: Buffer | string) => {
      this.recordActivity(sessionId);
      const payload = chunk.toString();
      this.emitOutput({
        sessionId,
        output: payload,
        timestamp: new Date().toISOString(),
      });
      this.emitError({
        sessionId,
        code: 'STDERR',
        message: payload,
        timestamp: new Date().toISOString(),
      });
    });

    childProcess.on('error', (error) => {
      this.emitError({
        sessionId,
        code: 'PROCESS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      this.emitStateChange(sessionId, this.getSession(sessionId)?.state ?? 'ready', 'error');
    });

    childProcess.on('close', () => {
      const previousState = this.getSession(sessionId)?.state ?? 'ready';
      this.emitStateChange(sessionId, previousState, 'closed');
      this.sessions.delete(sessionId);
    });
  }

  private emitOutput(event: TerminalOutputEvent): void {
    this.outputListeners.forEach((listener) => {
      listener(event);
    });
  }

  private emitError(event: TerminalErrorEvent): void {
    this.errorListeners.forEach((listener) => {
      listener(event);
    });
  }

  private emitStateChange(
    sessionId: TerminalSessionId,
    previousState: TerminalSessionState,
    newState: TerminalSessionState
  ): void {
    const managed = this.sessions.get(sessionId);
    if (managed) {
      this.sessions.set(sessionId, {
        ...managed,
        session: {
          ...managed.session,
          state: newState,
          lastActivityAt: new Date().toISOString(),
        },
      });
    }

    const event: TerminalStateChangeEvent = {
      sessionId,
      previousState,
      newState,
      timestamp: new Date().toISOString(),
    };

    this.stateListeners.forEach((listener) => {
      listener(event);
    });
  }
}

let instance: TerminalService | null = null;

export const getTerminalService = (): TerminalService => {
  if (!instance) {
    instance = new TerminalService();
  }
  return instance;
};

export const resetTerminalService = (): void => {
  instance = null;
};
