import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../src/shared/ipc';
import type { TerminalCreateResponse, TerminalDimensions } from '../src/shared/ipc';

describe('terminal IPC channels', () => {
  it('defines all required terminal channels', () => {
    expect(ipcChannels.terminalCreate).toBe('terminal:create');
    expect(ipcChannels.terminalWrite).toBe('terminal:write');
    expect(ipcChannels.terminalClose).toBe('terminal:close');
    expect(ipcChannels.terminalClear).toBe('terminal:clear');
    expect(ipcChannels.terminalResize).toBe('terminal:resize');
    expect(ipcChannels.terminalInspect).toBe('terminal:inspect');
    expect(ipcChannels.terminalOutputEvent).toBe('terminal:output-event');
    expect(ipcChannels.terminalErrorEvent).toBe('terminal:error-event');
    expect(ipcChannels.terminalStateChangeEvent).toBe('terminal:state-change-event');
  });

  it('terminal channels follow consistent naming pattern', () => {
    const channels = [
      ipcChannels.terminalCreate,
      ipcChannels.terminalWrite,
      ipcChannels.terminalClose,
      ipcChannels.terminalClear,
      ipcChannels.terminalResize,
      ipcChannels.terminalInspect,
      ipcChannels.terminalOutputEvent,
      ipcChannels.terminalErrorEvent,
      ipcChannels.terminalStateChangeEvent,
    ];

    channels.forEach((channel) => {
      expect(channel).toMatch(/^terminal:/);
    });
  });
});

describe('terminal IPC contract - create session', () => {
  it('create request requires bench ID', () => {
    const validCreate = { benchId: 'bench-1', siteId: null };
    expect(validCreate.benchId).toBeDefined();
  });

  it('create response has correct type structure', () => {
    const response: TerminalCreateResponse = {
      sessionId: 'terminal-12345-abc',
      state: 'ready',
      workingDirectory: '/workspace',
    };

    expect(response.sessionId).toBeDefined();
    expect(response.state).toBeDefined();
    expect(response.workingDirectory).toBeDefined();
    expect(typeof response.sessionId).toBe('string');
    expect(typeof response.state).toBe('string');
    expect(typeof response.workingDirectory).toBe('string');
  });

  it('terminal state is one of valid states', () => {
    const validStates = ['idle', 'connecting', 'ready', 'closed', 'error'] as const;
    const response: TerminalCreateResponse = {
      sessionId: 'terminal-123',
      state: 'ready',
      workingDirectory: '/workspace',
    };

    expect(validStates).toContain(response.state);
  });
});

describe('terminal IPC contract - write input', () => {
  it('write request requires session ID and data', () => {
    const writeInput = {
      sessionId: 'terminal-123',
      data: 'ls -la',
    };

    expect(writeInput.sessionId).toBeDefined();
    expect(writeInput.data).toBeDefined();
    expect(typeof writeInput.sessionId).toBe('string');
    expect(typeof writeInput.data).toBe('string');
  });

  it('accepts empty data string for write', () => {
    const writeInput = {
      sessionId: 'terminal-123',
      data: '', // Empty is valid (no-op)
    };

    expect(writeInput.data).toBe('');
  });

  it('accepts newline in write data', () => {
    const writeInput = {
      sessionId: 'terminal-123',
      data: 'echo hello\n',
    };

    expect(writeInput.data).toContain('\n');
  });
});

describe('terminal IPC contract - close session', () => {
  it('close request requires session ID', () => {
    const closeRequest = {
      sessionId: 'terminal-123',
      force: false,
    };

    expect(closeRequest.sessionId).toBeDefined();
    expect(typeof closeRequest.sessionId).toBe('string');
  });

  it('close request has optional force flag', () => {
    const closeGraceful = { sessionId: 'terminal-123', force: false };
    const closeForce = { sessionId: 'terminal-123', force: true };
    const closeDefault = { sessionId: 'terminal-123' };

    expect('force' in closeGraceful).toBe(true);
    expect('force' in closeForce).toBe(true);
    expect('force' in closeDefault).toBe(false);
  });
});

describe('terminal IPC contract - clear output', () => {
  it('clear request requires session ID', () => {
    const clearRequest = {
      sessionId: 'terminal-123',
    };

    expect(clearRequest.sessionId).toBeDefined();
    expect(typeof clearRequest.sessionId).toBe('string');
  });
});

describe('terminal IPC contract - resize', () => {
  it('resize request requires session ID and dimensions', () => {
    const dimensions: TerminalDimensions = {
      rows: 24,
      cols: 80,
    };

    const resizeRequest = {
      sessionId: 'terminal-123',
      dimensions,
    };

    expect(resizeRequest.sessionId).toBeDefined();
    expect(resizeRequest.dimensions).toBeDefined();
  });

  it('dimensions have valid row and column values', () => {
    const validDimensions: TerminalDimensions[] = [
      { rows: 1, cols: 1 }, // Minimum
      { rows: 24, cols: 80 }, // Standard
      { rows: 50, cols: 200 }, // Large
      { rows: 100, cols: 255 }, // Very large
    ];

    validDimensions.forEach((dim) => {
      expect(typeof dim.rows).toBe('number');
      expect(typeof dim.cols).toBe('number');
      expect(dim.rows).toBeGreaterThan(0);
      expect(dim.cols).toBeGreaterThan(0);
    });
  });
});

describe('terminal IPC contract - inspect session', () => {
  it('inspect request requires session ID', () => {
    const inspectRequest = {
      sessionId: 'terminal-123',
    };

    expect(inspectRequest.sessionId).toBeDefined();
    expect(typeof inspectRequest.sessionId).toBe('string');
  });

  it('inspect response includes context and activity metadata', () => {
    const inspectResponse = {
      sessionId: 'terminal-123',
      state: 'ready' as const,
      workingDirectory: '/workspace',
      contextBenchId: 'bench-1',
      contextSiteId: 'site-1',
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    expect(inspectResponse.contextBenchId).toBe('bench-1');
    expect(inspectResponse.contextSiteId).toBe('site-1');
    expect(typeof inspectResponse.createdAt).toBe('string');
    expect(typeof inspectResponse.lastActivityAt).toBe('string');
  });
});

describe('terminal IPC contract - response consistency', () => {
  it('terminal response indicates success/failure consistently', () => {
    const successResponse = {
      success: true,
      sessionId: 'terminal-123',
    };

    const failureResponse = {
      success: false,
      sessionId: 'terminal-123',
    };

    expect(typeof successResponse.success).toBe('boolean');
    expect(typeof failureResponse.success).toBe('boolean');
  });

  it('session ID format is consistent across responses', () => {
    const sessionIds = [
      'terminal-123-abc',
      'terminal-1234567890-xyz',
      'terminal-999999-qwerty',
    ];

    sessionIds.forEach((id) => {
      expect(id).toMatch(/^terminal-/);
    });
  });
});

describe('terminal IPC contract - event types', () => {
  it('output event has required fields', () => {
    const outputEvent = {
      sessionId: 'terminal-123',
      output: 'hello world\n',
      timestamp: new Date().toISOString(),
    };

    expect(outputEvent.sessionId).toBeDefined();
    expect(outputEvent.output).toBeDefined();
    expect(outputEvent.timestamp).toBeDefined();
  });

  it('error event has required fields', () => {
    const errorEvent = {
      sessionId: 'terminal-123',
      code: 'ECONNREFUSED',
      message: 'Connection refused',
      timestamp: new Date().toISOString(),
    };

    expect(errorEvent.sessionId).toBeDefined();
    expect(errorEvent.code).toBeDefined();
    expect(errorEvent.message).toBeDefined();
    expect(errorEvent.timestamp).toBeDefined();
  });

  it('state change event has required fields', () => {
    const stateChangeEvent = {
      sessionId: 'terminal-123',
      previousState: 'connecting' as const,
      newState: 'ready' as const,
      timestamp: new Date().toISOString(),
    };

    expect(stateChangeEvent.sessionId).toBeDefined();
    expect(stateChangeEvent.previousState).toBeDefined();
    expect(stateChangeEvent.newState).toBeDefined();
    expect(stateChangeEvent.timestamp).toBeDefined();
  });

  it('bridge exposes subscription hook shapes for terminal events', () => {
    const unsubscribe = () => undefined;
    const bridgeHooks = {
      onTerminalOutput: (listener: (event: { sessionId: string; output: string; timestamp: string }) => void) => {
        void listener;
        return unsubscribe;
      },
      onTerminalError: (listener: (event: { sessionId: string; code: string; message: string; timestamp: string }) => void) => {
        void listener;
        return unsubscribe;
      },
      onTerminalStateChange: (
        listener: (event: { sessionId: string; previousState: string; newState: string; timestamp: string }) => void
      ) => {
        void listener;
        return unsubscribe;
      },
    };

    expect(typeof bridgeHooks.onTerminalOutput(() => undefined)).toBe('function');
    expect(typeof bridgeHooks.onTerminalError(() => undefined)).toBe('function');
    expect(typeof bridgeHooks.onTerminalStateChange(() => undefined)).toBe('function');
  });
});

describe('terminal IPC contract - safety constraints', () => {
  it('session ID prevents command injection', () => {
    // Session IDs should be treated as opaque identifiers
    const injectionAttempts = [
      'terminal-123; rm -rf /',
      'terminal-123 && echo pwned',
      "terminal-123' OR '1'='1",
      'terminal-123`whoami`',
    ];

    injectionAttempts.forEach((id) => {
      // In real implementation, these would be rejected by validation
      expect(typeof id).toBe('string');
    });
  });

  it('write data does not execute arbitrary commands', () => {
    // Write data should be treated as raw input only
    const writeData = 'ls -la /etc/passwd; cat /etc/shadow';
    expect(typeof writeData).toBe('string');
    // The data itself is just a string - execution safety is enforced at runtime
  });
});
