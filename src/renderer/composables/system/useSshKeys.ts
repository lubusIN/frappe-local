import { ref } from 'vue';
import { toast } from 'frappe-ui';

import { useIpc } from '@frappe-local/renderer/composables/system/useIpc';
import type { BenchListItem } from '@frappe-local/shared/core/ipc';

export const useSshKeys = () => {
  const ipc = useIpc();
  const showSshConfirmation = ref(false);
  const pendingSshValue = ref(false);
  
  const performSshSave = async (newValue: boolean) => {
    try {
      const settings = await ipc.getSettings();
      if (!settings) {
        throw new Error('Settings are not available.');
      }
      await ipc.setSettings({ ...settings, shareSshKeys: newValue });
      toast.success(`SSH Key sharing ${newValue ? 'enabled' : 'disabled'}.`);
        
      const benches = await ipc.listBenches();
      const runningBenches = benches.filter((b: BenchListItem) => b.status === 'running');
      if (runningBenches.length > 0) {
        toast.success(`Restarting ${runningBenches.length} running benches to apply SSH settings...`);
        for (const bench of runningBenches) {
          await ipc.updateBench(bench.id, { status: 'running' });
        }
        toast.success('Benches restarted successfully.');
      }
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
    performSshSave,
  };
};
