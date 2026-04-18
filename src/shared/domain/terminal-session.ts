/**
 * Terminal session contracts and types for Phase 8 - Console Integration
 * Defines the interface for ephemeral terminal sessions scoped to bench/site context
 */

export type TerminalSessionId = string & { readonly __brand: 'TerminalSessionId' };

export const createTerminalSessionId = (id: string): TerminalSessionId => {
  return id as TerminalSessionId;
};

/**
 * Terminal session state lifecycle
 */
export type TerminalSessionState = 'idle' | 'connecting' | 'ready' | 'closed' | 'error';

/**
 * Terminal session contract - represents an ephemeral terminal session
 */
export interface TerminalSession {
  readonly id: TerminalSessionId;
  readonly state: TerminalSessionState;
  readonly contextBenchId: string;
  readonly contextSiteId: string | null;
  readonly workingDirectory: string;
  readonly createdAt: string;
  readonly lastActivityAt: string;
}

/**
 * Terminal output event - streamed from terminal to renderer
 */
export interface TerminalOutputEvent {
  readonly sessionId: TerminalSessionId;
  readonly output: string;
  readonly timestamp: string;
}

/**
 * Terminal error event - connection or execution failures
 */
export interface TerminalErrorEvent {
  readonly sessionId: TerminalSessionId;
  readonly code: string;
  readonly message: string;
  readonly timestamp: string;
}

/**
 * Terminal session state change event
 */
export interface TerminalStateChangeEvent {
  readonly sessionId: TerminalSessionId;
  readonly previousState: TerminalSessionState;
  readonly newState: TerminalSessionState;
  readonly timestamp: string;
}

/**
 * Request to create a new terminal session
 */
export interface TerminalCreateRequest {
  readonly benchId: string;
  readonly siteId?: string | null;
  readonly workspacePath: string;
}

/**
 * Response when creating a terminal session
 */
export interface TerminalCreateResponse {
  readonly sessionId: TerminalSessionId;
  readonly state: TerminalSessionState;
  readonly workingDirectory: string;
}

/**
 * Request to write input to terminal
 */
export interface TerminalWriteInput {
  readonly sessionId: TerminalSessionId;
  readonly data: string;
}

/**
 * Request to clear terminal output
 */
export interface TerminalClearRequest {
  readonly sessionId: TerminalSessionId;
}

/**
 * Request to close/terminate a session
 */
export interface TerminalCloseRequest {
  readonly sessionId: TerminalSessionId;
  readonly force?: boolean;
}

/**
 * Terminal dimensions for resize operations
 */
export interface TerminalDimensions {
  readonly rows: number;
  readonly cols: number;
}

/**
 * Request to resize terminal
 */
export interface TerminalResizeRequest {
  readonly sessionId: TerminalSessionId;
  readonly dimensions: TerminalDimensions;
}

/**
 * Success response for terminal operations
 */
export interface TerminalOperationResponse {
  readonly success: boolean;
  readonly sessionId: TerminalSessionId;
}

export interface TerminalCreateResult {
  readonly success: boolean;
  readonly session?: TerminalSession;
  readonly error?: string;
}
