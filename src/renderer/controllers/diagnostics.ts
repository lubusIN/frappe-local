import { ref, computed } from 'vue';
import type { DiagnosticsReport } from '../../shared/domain/diagnostics';
import type { RendererBridge } from '../../shared/core/ipc';
import { createRendererLogger } from '../utils/logger';

const diagnosticsLogger = createRendererLogger('diagnostics');

type DiagnosticsState = {
  report: DiagnosticsReport | null;
  isRunning: boolean;
  error: string | null;
  lastRunAt: string | null;
};

const state = ref<DiagnosticsState>({
  report: null,
  isRunning: false,
  error: null,
  lastRunAt: null,
});

export const useDiagnostics = (bridge: RendererBridge) => {
  const runDiagnostics = async (): Promise<boolean> => {
    state.value.isRunning = true;
    state.value.error = null;

    try {
      const report = await bridge.runDiagnostics();
      state.value.report = report;
      state.value.lastRunAt = report.completedAt;
      diagnosticsLogger.info('Diagnostics completed successfully');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.value.error = message;
      diagnosticsLogger.error(`Diagnostics failed: ${message}`);
      return false;
    } finally {
      state.value.isRunning = false;
    }
  };

  const loadLastReport = async (): Promise<void> => {
    try {
      const report = await bridge.getLastDiagnosticsReport();
      if (report) {
        state.value.report = report;
        state.value.lastRunAt = report.completedAt;
      }
    } catch (error) {
      diagnosticsLogger.warn(`Failed to load last diagnostics report: ${error}`);
    }
  };

  const clearError = (): void => {
    state.value.error = null;
  };

  return {
    report: computed(() => state.value.report),
    isRunning: computed(() => state.value.isRunning),
    error: computed(() => state.value.error),
    lastRunAt: computed(() => state.value.lastRunAt),
    hasCriticalIssues: computed(() => state.value.report?.hasCriticalIssues ?? false),
    hasWarnings: computed(() => state.value.report?.hasWarnings ?? false),
    runDiagnostics,
    loadLastReport,
    clearError,
  };
};
