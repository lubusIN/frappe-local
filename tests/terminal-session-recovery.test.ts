import { describe, expect, it } from 'vitest';
import {
  parsePersistedTerminalSessionRef,
  resolveTerminalRecoveryDecision,
} from '../src/renderer/terminal-session-recovery';

describe('terminal session recovery policy', () => {
  it('returns null for malformed persisted session payloads', () => {
    expect(parsePersistedTerminalSessionRef('{bad-json')).toBeNull();
    expect(parsePersistedTerminalSessionRef(JSON.stringify({ sessionId: 1 }))).toBeNull();
  });

  it('parses persisted session references', () => {
    expect(
      parsePersistedTerminalSessionRef(
        JSON.stringify({ sessionId: 'terminal-1', benchId: 'bench-1', siteId: 'site-1' })
      )
    ).toEqual({
      sessionId: 'terminal-1',
      benchId: 'bench-1',
      siteId: 'site-1',
    });
  });

  it('clears stale session references when the session no longer exists', () => {
    const decision = resolveTerminalRecoveryDecision(
      { sessionId: 'terminal-1', benchId: 'bench-1', siteId: null },
      { benchId: 'bench-1', siteId: null },
      null
    );

    expect(decision.action).toBe('clear');
    expect(decision.message).toContain('no longer available');
  });

  it('closes a recovered session when the current target does not match', () => {
    const decision = resolveTerminalRecoveryDecision(
      { sessionId: 'terminal-1', benchId: 'bench-1', siteId: null },
      { benchId: 'bench-2', siteId: null },
      {
        sessionId: 'terminal-1',
        state: 'ready',
        workingDirectory: '/Users/example/bench-1',
        contextBenchId: 'bench-1',
        contextSiteId: null,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      }
    );

    expect(decision.action).toBe('close-and-clear');
    expect(decision.message).toContain('closed for safety');
  });

  it('restores a ready session when persisted and active context match', () => {
    const decision = resolveTerminalRecoveryDecision(
      { sessionId: 'terminal-1', benchId: 'bench-1', siteId: 'site-1' },
      { benchId: 'bench-1', siteId: 'site-1' },
      {
        sessionId: 'terminal-1',
        state: 'ready',
        workingDirectory: '/Users/example/bench-1/sites/site-1',
        contextBenchId: 'bench-1',
        contextSiteId: 'site-1',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      }
    );

    expect(decision.action).toBe('restore');
    expect(decision.message).toContain('/Users/example/bench-1/sites/site-1');
  });
});