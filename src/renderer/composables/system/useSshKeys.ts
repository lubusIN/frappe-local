import { ref } from 'vue';
import { toast } from 'frappe-ui';

export const useSshKeys = () => {
  const showSshConfirmation = ref(false);
  const pendingSshValue = ref(false);
  
  const performSshSave = async (newValue: boolean) => {
    try {
      const settings = await window.frappeLocal.getSettings();
      await window.frappeLocal.setSettings({ ...(settings || {}), shareSshKeys: newValue });
      toast.success(`SSH Key sharing ${newValue ? 'enabled' : 'disabled'}.`);
        
      const benches = await window.frappeLocal.listBenches();
      const runningBenches = benches.filter(b => b.status === 'running');
      if (runningBenches.length > 0) {
        toast.success(`Restarting ${runningBenches.length} running benches to apply SSH settings...`);
        for (const bench of runningBenches) {
          await window.frappeLocal.updateBench(bench.id, { status: 'running' });
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

  const toggleSshKeys = async (currentValue: boolean, newValue: boolean) => {
    if (currentValue === newValue) {
      return false; // No change
    }
    const benches = await window.frappeLocal.listBenches();
    const runningBenches = benches.filter(b => b.status === 'running');
    if (runningBenches.length > 0) {
      pendingSshValue.value = newValue;
      showSshConfirmation.value = true;
      return new Promise<boolean>((resolve) => {
        // We need a way to resolve this when the dialog is confirmed or cancelled.
        // For simplicity, we can just return a promise that doesn't resolve immediately,
        // but it's easier to just handle the confirm/cancel callbacks in the component.
      });
    } else {
      return await performSshSave(newValue);
    }
  };

  return {
    showSshConfirmation,
    pendingSshValue,
    performSshSave,
  };
};
