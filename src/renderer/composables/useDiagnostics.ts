import { onMounted, ref } from 'vue';
import type { DiagnosticsReport } from '../../shared/domain/diagnostics';
import { useIpc } from './useIpc';

export const useDiagnostics = () => {
  const report = ref<DiagnosticsReport | null>(null);
  const running = ref(false);
  const fixing = ref(false);
  const nuking = ref(false);
  const error = ref<string | null>(null);

  const run = async () => {
    running.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      report.value = await ipc.runDiagnostics();
    } catch (err) {
      error.value = String(err);
    } finally {
      running.value = false;
    }
  };

  const fix = async (checkType: string) => {
    fixing.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      const success = await ipc.fixRuntime(checkType);
      if (success) {
        await run();
      } else {
        error.value = 'Failed to apply fix. Please try manual remediation.';
      }
    } catch (err) {
      error.value = String(err);
    } finally {
      fixing.value = false;
    }
  };

  const nuke = async (): Promise<boolean> => {
    nuking.value = true;
    error.value = null;

    try {
      const ipc = useIpc();
      const ok = await ipc.nukeDevState();
      if (!ok) {
        error.value = 'Failed to nuke development state. Please try again.';
        return false;
      }

      report.value = null;
      return true;
    } catch (err) {
      error.value = String(err);
      return false;
    } finally {
      nuking.value = false;
    }
  };

  onMounted(() => {
    const ipc = useIpc();
    ipc.getLastDiagnosticsReport().then((last) => {
      if (last) {
        report.value = last;
      }
    });
  });

  return {
    report,
    running,
    fixing,
    nuking,
    error,
    run,
    fix,
    nuke,
  };
};
