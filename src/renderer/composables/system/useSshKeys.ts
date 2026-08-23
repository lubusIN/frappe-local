import { ref } from 'vue';
import { toastTask } from '@frappe-local/renderer/composables/ui/toastTask';

import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';
import { runAndWaitForTask } from '@frappe-local/renderer/composables/system/waitForTask';
import type { BenchListItem } from '@frappe-local/shared/core';

export const useSshKeys = () => {
  const ipc = useIpc();
  const showSshConfirmation = ref(false);
  const pendingSshValue = ref(false);
  const isRestartingSsh = ref(false);
  
  const handleSshToggle = async (newValue: boolean, onNoRestartNeeded?: () => Promise<void>) => {
    pendingSshValue.value = newValue;
    const benches = await ipc.listBenches();
    const runningBenches = benches.filter((b: BenchListItem) => b.status === 'running');
    
    if (runningBenches.length > 0) {
      showSshConfirmation.value = true;
    } else {
      if (onNoRestartNeeded) {
        await onNoRestartNeeded();
      } else {
        await performSshSave(newValue, false);
      }
    }
  };

  const performSshSave = async (newValue: boolean, restartBenches: boolean = true) => {
    isRestartingSsh.value = true;
    const promise = (async () => {
      const settings = await ipc.getSettings();
      if (!settings) {
        throw new Error('Settings are not available.');
      }
      await ipc.setSettings({ ...settings, shareSshKeys: newValue });
        
      if (restartBenches) {
        const benches = await ipc.listBenches();
        const runningBenches = benches.filter((b: BenchListItem) => b.status === 'running');
        if (runningBenches.length > 0) {
          const restartPromises = runningBenches.map(bench => {
            return runAndWaitForTask(
              () => ipc.updateBench(bench.id, { status: 'running' }),
              'bench',
              bench.id,
              /^Restart bench/i
            );
          });
          await Promise.all(restartPromises);
        }
      }
    })();

    toastTask(promise, {
      loading: restartBenches ? 'Applying SSH settings and restarting benches...' : 'Applying SSH settings...',
      success: `SSH Key sharing ${newValue ? 'enabled' : 'disabled'}.`,
      error: 'Failed to update SSH settings.',
    });

    try {
      await promise;
      return true;
    } catch (err) {
      console.error('Failed to update SSH keys:', err);
      return false;
    } finally {
      isRestartingSsh.value = false;
    }
  };

  return {
    showSshConfirmation,
    pendingSshValue,
    isRestartingSsh,
    handleSshToggle,
    performSshSave,
  };
};
