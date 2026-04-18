import type { TerminalSessionInspection } from '../shared/ipc';

export type PersistedTerminalSessionRef = {
  readonly sessionId: string;
  readonly benchId: string;
  readonly siteId: string | null;
};

export type TerminalRecoveryDecision = {
  readonly action: 'ignore' | 'restore' | 'clear' | 'close-and-clear';
  readonly message: string | null;
};

export const parsePersistedTerminalSessionRef = (
  rawValue: string | null
): PersistedTerminalSessionRef | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (typeof parsed.sessionId !== 'string' || typeof parsed.benchId !== 'string') {
      return null;
    }

    if (parsed.siteId !== null && typeof parsed.siteId !== 'string' && typeof parsed.siteId !== 'undefined') {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      benchId: parsed.benchId,
      siteId: typeof parsed.siteId === 'string' ? parsed.siteId : null,
    };
  } catch {
    return null;
  }
};

export const resolveTerminalRecoveryDecision = (
  persistedSession: PersistedTerminalSessionRef | null,
  selectedTarget: { benchId: string; siteId: string | null },
  inspectedSession: TerminalSessionInspection | null
): TerminalRecoveryDecision => {
  if (!persistedSession) {
    return { action: 'ignore', message: null };
  }

  if (!inspectedSession) {
    return {
      action: 'clear',
      message: 'Previous console session is no longer available. Start a new session.',
    };
  }

  if (inspectedSession.state !== 'ready' && inspectedSession.state !== 'connecting') {
    return {
      action: 'close-and-clear',
      message: 'Previous console session was not recoverable and has been closed.',
    };
  }

  if (
    inspectedSession.contextBenchId !== persistedSession.benchId ||
    inspectedSession.contextSiteId !== persistedSession.siteId
  ) {
    return {
      action: 'close-and-clear',
      message: 'Recovered console session did not match its saved context and was closed for safety.',
    };
  }

  if (
    selectedTarget.benchId !== persistedSession.benchId ||
    selectedTarget.siteId !== persistedSession.siteId
  ) {
    return {
      action: 'close-and-clear',
      message: 'Saved console session did not match the active context and was closed for safety.',
    };
  }

  return {
    action: 'restore',
    message: `Recovered previous console session in ${inspectedSession.workingDirectory}.`,
  };
};