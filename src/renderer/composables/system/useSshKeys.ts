import { ref } from 'vue';
import { toast } from 'frappe-ui';

import { useIpc } from '@frappe-local/renderer/composables/system';
import type { BenchListItem } from '@frappe-local/shared/core';

export const useSshKeys = () => {
  const ipc = useIpc();
  const showSshConfirmation = ref(false);
  const pendingSshValue = ref(false);
  
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
    try {
      const settings = await ipc.getSettings();
      if (!settings) {
        throw new Error('Settings are not available.');
      }
      await ipc.setSettings({ ...settings, shareSshKeys: newValue });
        
      if (restartBenches) {
        const benches = await ipc.listBenches();
        const runningBenches = benches.filter((b: BenchListItem) => b.status === 'running');
        if (runningBenches.length > 0) {
          toast.info(`Restarting ${runningBenches.length} running bench(es)...`);
          const benchIds = runningBenches.map(b => b.id);
          for (const bench of runningBenches) {
            await ipc.updateBench(bench.id, { status: 'running' });
          }
          
          let allRestarted = false;
          while (!allRestarted) {
            await new Promise(r => setTimeout(r, 1000));
            const currentBenches = await ipc.listBenches();
            const pending = currentBenches.filter(b => benchIds.includes(b.id) && b.status === 'queued');
            if (pending.length === 0) {
              allRestarted = true;
            }
          }
          toast.success('Benches restarted successfully.');
        }
      }
      toast.success(`SSH Key sharing ${newValue ? 'enabled' : 'disabled'}.`);
      return true;
    } catch (err) {
      console.error('Failed to update SSH keys:', err);
      toast.error('Failed to update SSH settings.');
      return false;
    }
  };

  return {
    showSshConfirmation,
    pendingSshValue,
    handleSshToggle,
    performSshSave,
  };
};
