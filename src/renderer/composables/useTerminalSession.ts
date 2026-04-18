import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BenchListItem, SiteListItem } from '../../shared/ipc';
import { useIpc } from './useIpc';
import {
  normalizeTargetForBench,
  resolveContextLabel,
  shouldResetSessionOnContextSwitch,
  validateTerminalTarget,
} from '../terminal-context-policy';
import {
  appendCommandHistory,
  moveHistoryCursor,
  readHistoryEntry,
} from '../terminal-productivity';
import {
  parsePersistedTerminalSessionRef,
  resolveTerminalRecoveryDecision,
} from '../terminal-session-recovery';

const consoleStorageKeys = {
  benchId: 'console:lastBenchId',
  siteId: 'console:lastSiteId',
  history: 'console:commandHistory',
  session: 'console:lastSession',
} as const;

export const useTerminalSession = () => {
  const ipc = useIpc();
  const benches = ref<BenchListItem[]>([]);
  const sites = ref<SiteListItem[]>([]);
  const selectedBenchId = ref('');
  const selectedSiteId = ref<string | null>(null);

  const loadingContext = ref(false);
  const starting = ref(false);
  const stopping = ref(false);
  const reconnecting = ref(false);
  const executing = ref(false);
  const openingFolder = ref(false);
  const openingEditor = ref(false);
  const openingDevcontainer = ref(false);

  const sessionId = ref<string | null>(null);
  const sessionState = ref<'idle' | 'connecting' | 'ready' | 'closed' | 'error'>('idle');
  const output = ref<string[]>([]);
  const commandInput = ref('');
  const error = ref<string | null>(null);
  const contextNotice = ref<string | null>(null);
  const commandHistory = ref<string[]>([]);
  const historyCursor = ref(-1);
  const copyingOutput = ref(false);

  const hasSession = computed(() => !!sessionId.value && sessionState.value !== 'closed');
  const canRunCommands = computed(() => !!sessionId.value && sessionState.value === 'ready');
  const filteredSites = computed(() =>
    sites.value.filter((site) => site.benchId === selectedBenchId.value)
  );
  const currentContextLabel = computed(() =>
    resolveContextLabel(benches.value, sites.value, {
      benchId: selectedBenchId.value,
      siteId: selectedSiteId.value,
    })
  );
  const currentPromptPrefix = computed(() => {
    if (!selectedBenchId.value) {
      return 'no-context';
    }

    const bench = benches.value.find((entry) => entry.id === selectedBenchId.value);
    const site = selectedSiteId.value
      ? sites.value.find((entry) => entry.id === selectedSiteId.value && entry.benchId === selectedBenchId.value)
      : null;

    return site ? `${bench?.name ?? 'bench'}:${site.name}` : `${bench?.name ?? 'bench'}:root`;
  });

  const appendOutput = (chunk: string) => {
    output.value = [...output.value, chunk];
  };

  const persistContext = () => {
    localStorage.setItem(consoleStorageKeys.benchId, selectedBenchId.value);
    if (selectedSiteId.value) {
      localStorage.setItem(consoleStorageKeys.siteId, selectedSiteId.value);
      return;
    }

    localStorage.removeItem(consoleStorageKeys.siteId);
  };

  const persistHistory = () => {
    localStorage.setItem(consoleStorageKeys.history, JSON.stringify(commandHistory.value));
  };

  const persistSessionRef = () => {
    if (!sessionId.value || !selectedBenchId.value) {
      localStorage.removeItem(consoleStorageKeys.session);
      return;
    }

    localStorage.setItem(
      consoleStorageKeys.session,
      JSON.stringify({
        sessionId: sessionId.value,
        benchId: selectedBenchId.value,
        siteId: selectedSiteId.value,
      })
    );
  };

  const clearPersistedSessionRef = () => {
    localStorage.removeItem(consoleStorageKeys.session);
  };

  const resetSessionForContextSwitch = async (message: string) => {
    contextNotice.value = message;
    if (sessionId.value) {
      appendOutput('\r\n[session] context changed; resetting current session\r\n');
      await ipc.terminalClose(sessionId.value, true);
    }
    sessionId.value = null;
    sessionState.value = 'idle';
    commandInput.value = '';
    clearPersistedSessionRef();
  };

  const restorePersistedSession = async () => {
    const persistedSession = parsePersistedTerminalSessionRef(localStorage.getItem(consoleStorageKeys.session));
    if (!persistedSession) {
      return;
    }

    const inspectedSession = await ipc.terminalInspect(persistedSession.sessionId);
    const decision = resolveTerminalRecoveryDecision(
      persistedSession,
      {
        benchId: selectedBenchId.value,
        siteId: selectedSiteId.value,
      },
      inspectedSession
    );

    if (decision.action === 'restore' && inspectedSession) {
      sessionId.value = inspectedSession.sessionId;
      sessionState.value = inspectedSession.state;
      contextNotice.value = decision.message;
      appendOutput(`\r\n[session] restored ${inspectedSession.workingDirectory}\r\n`);
      persistSessionRef();
      return;
    }

    if (decision.action === 'close-and-clear' && inspectedSession) {
      await ipc.terminalClose(inspectedSession.sessionId, true);
    }

    clearPersistedSessionRef();
    if (decision.message) {
      contextNotice.value = decision.message;
    }
  };

  const loadContext = async () => {
    loadingContext.value = true;
    error.value = null;

    try {
      const [benchList, siteList] = await Promise.all([ipc.listBenches(), ipc.listSites()]);
      benches.value = benchList;
      sites.value = siteList;

      if (!selectedBenchId.value) {
        const persistedBenchId = localStorage.getItem(consoleStorageKeys.benchId) ?? '';
        selectedBenchId.value = persistedBenchId || benchList[0]?.id || '';
      }

      if (selectedBenchId.value && selectedSiteId.value === null) {
        selectedSiteId.value = localStorage.getItem(consoleStorageKeys.siteId);
      }

      const validation = validateTerminalTarget(benchList, siteList, {
        benchId: selectedBenchId.value,
        siteId: selectedSiteId.value,
      });

      if (selectedBenchId.value) {
        selectedBenchId.value = validation.normalizedTarget.benchId;
        selectedSiteId.value = validation.normalizedTarget.siteId;
        persistContext();
      }

      contextNotice.value = validation.reason;

      if (hasSession.value && (!validation.valid || validation.reason)) {
        await resetSessionForContextSwitch(validation.reason ?? 'Selected context changed. Session reset.');
      }
    } catch (err) {
      error.value = String(err);
      benches.value = [];
      sites.value = [];
    } finally {
      loadingContext.value = false;
    }
  };

  const startSession = async () => {
    if (!selectedBenchId.value) {
      error.value = 'Select a bench before starting a session.';
      return;
    }

    starting.value = true;
    error.value = null;

    try {
      sessionState.value = 'connecting';
      contextNotice.value = null;
      const response = await ipc.terminalCreate(selectedBenchId.value, selectedSiteId.value);
      sessionId.value = response.sessionId;
      sessionState.value = response.state;
      persistSessionRef();
      appendOutput(`\r\n[session] connected to ${response.workingDirectory}\r\n`);
    } catch (err) {
      sessionState.value = 'error';
      error.value = String(err);
    } finally {
      starting.value = false;
    }
  };

  const stopSession = async () => {
    if (!sessionId.value) {
      return;
    }

    stopping.value = true;
    error.value = null;

    try {
      await ipc.terminalClose(sessionId.value);
    } catch (err) {
      error.value = String(err);
    } finally {
      stopping.value = false;
    }
  };

  const reconnect = async () => {
    reconnecting.value = true;
    try {
      if (sessionId.value) {
        await stopSession();
      }
      await startSession();
    } finally {
      reconnecting.value = false;
    }
  };

  const clearOutput = async () => {
    if (!sessionId.value) {
      output.value = [];
      return;
    }

    await ipc.terminalClear(sessionId.value);
    output.value = [];
  };

  const runCommand = async () => {
    const command = commandInput.value.trim();
    if (!command || !sessionId.value || sessionState.value !== 'ready') {
      return;
    }

    executing.value = true;
    error.value = null;

    try {
      await ipc.terminalWrite(sessionId.value, `${command}\n`);
      appendOutput(`$ ${command}\r\n`);
      commandHistory.value = appendCommandHistory(commandHistory.value, command);
      historyCursor.value = -1;
      persistHistory();
      commandInput.value = '';
    } catch (err) {
      error.value = String(err);
    } finally {
      executing.value = false;
    }
  };

  const stepHistory = (direction: 'older' | 'newer') => {
    historyCursor.value = moveHistoryCursor(commandHistory.value, historyCursor.value, direction);
    commandInput.value = readHistoryEntry(commandHistory.value, historyCursor.value);
  };

  const copyOutput = async () => {
    copyingOutput.value = true;
    contextNotice.value = null;

    try {
      await navigator.clipboard.writeText(output.value.join(''));
      contextNotice.value = 'Console output copied to the clipboard.';
    } catch (err) {
      error.value = String(err);
    } finally {
      copyingOutput.value = false;
    }
  };

  const openContextFolder = async () => {
    if (!selectedBenchId.value) {
      error.value = 'Select a bench before opening a folder.';
      return;
    }

    openingFolder.value = true;
    contextNotice.value = null;

    try {
      const opened = await ipc.terminalOpenFolder(selectedBenchId.value, selectedSiteId.value);
      contextNotice.value = opened ? 'Opened the selected context folder.' : 'Unable to open the selected context folder.';
    } catch (err) {
      error.value = String(err);
    } finally {
      openingFolder.value = false;
    }
  };

  const openContextInEditor = async () => {
    if (!selectedBenchId.value) {
      error.value = 'Select a bench before opening the editor.';
      return;
    }

    openingEditor.value = true;
    contextNotice.value = null;

    try {
      const opened = await ipc.terminalOpenEditor(selectedBenchId.value, selectedSiteId.value);
      contextNotice.value = opened ? 'Opened the selected context in the configured editor.' : 'Unable to open the configured editor for this context.';
    } catch (err) {
      error.value = String(err);
    } finally {
      openingEditor.value = false;
    }
  };

  const openDevcontainer = async () => {
    if (!selectedBenchId.value) {
      error.value = 'Select a bench before opening devcontainer files.';
      return;
    }

    openingDevcontainer.value = true;
    contextNotice.value = null;

    try {
      const opened = await ipc.terminalOpenDevcontainer(selectedBenchId.value);
      contextNotice.value = opened ? 'Opened devcontainer files in the configured editor.' : 'No devcontainer configuration was found for this bench.';
    } catch (err) {
      error.value = String(err);
    } finally {
      openingDevcontainer.value = false;
    }
  };

  const stopOutputSubscription = ipc.onTerminalOutput((event) => {
    if (!sessionId.value || event.sessionId !== sessionId.value) {
      return;
    }

    appendOutput(event.output);
  });

  const stopErrorSubscription = ipc.onTerminalError((event) => {
    if (!sessionId.value || event.sessionId !== sessionId.value) {
      return;
    }

    error.value = event.message.trim() || event.code;
  });

  const stopStateSubscription = ipc.onTerminalStateChange((event) => {
    if (!sessionId.value || event.sessionId !== sessionId.value) {
      return;
    }

    sessionState.value = event.newState;
    if (event.newState === 'closed') {
      appendOutput('\r\n[session] closed\r\n');
      sessionId.value = null;
      clearPersistedSessionRef();
    }
  });

  watch(selectedBenchId, (nextBenchId) => {
    const normalizedTarget = normalizeTargetForBench(nextBenchId, selectedSiteId.value, sites.value);
    if (normalizedTarget.siteId !== selectedSiteId.value) {
      selectedSiteId.value = normalizedTarget.siteId;
    }

    persistContext();
  });

  watch(selectedSiteId, () => {
    persistContext();
  });

  watch([selectedBenchId, selectedSiteId], async ([nextBenchId, nextSiteId], [previousBenchId, previousSiteId]) => {
    if (!nextBenchId || !previousBenchId) {
      return;
    }

    const previousTarget = { benchId: previousBenchId, siteId: previousSiteId };
    const nextTarget = { benchId: nextBenchId, siteId: nextSiteId };

    if (shouldResetSessionOnContextSwitch(hasSession.value, previousTarget, nextTarget)) {
      await resetSessionForContextSwitch('Context switched. Start a new session for the selected target.');
    }
  });

  onMounted(() => {
    const persistedHistory = localStorage.getItem(consoleStorageKeys.history);
    if (persistedHistory) {
      try {
        const parsed = JSON.parse(persistedHistory) as unknown;
        if (Array.isArray(parsed)) {
          commandHistory.value = parsed.filter((entry): entry is string => typeof entry === 'string');
        }
      } catch {
        commandHistory.value = [];
      }
    }

    void (async () => {
      await loadContext();
      await restorePersistedSession();
    })();
  });

  onBeforeUnmount(() => {
    stopOutputSubscription();
    stopErrorSubscription();
    stopStateSubscription();
  });

  return {
    benches,
    sites,
    selectedBenchId,
    selectedSiteId,
    loadingContext,
    starting,
    stopping,
    reconnecting,
    executing,
    copyingOutput,
    openingFolder,
    openingEditor,
    openingDevcontainer,
    sessionId,
    sessionState,
    output,
    commandInput,
    error,
    contextNotice,
    hasSession,
    canRunCommands,
    filteredSites,
    currentContextLabel,
    currentPromptPrefix,
    loadContext,
    startSession,
    stopSession,
    reconnect,
    clearOutput,
    copyOutput,
    openContextFolder,
    openContextInEditor,
    openDevcontainer,
    runCommand,
    stepHistory,
  };
};
