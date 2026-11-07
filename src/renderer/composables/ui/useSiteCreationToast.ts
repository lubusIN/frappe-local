import type { Ref } from 'vue';
import { runAndWaitForTask } from '@frappe-local/renderer/composables/system';
import { toastTask } from '@frappe-local/renderer/composables/ui/toastTask';

export const trackSiteCreationToast = (
  site: { id: string; name: string },
  options: {
    refreshSites: (force?: boolean) => void | Promise<void>;
    selectedTaskId: Ref<string | null>;
    getLatestRelevantTaskId: (resourceId: string) => string | null;
    startTime?: number;
  }
) => {
  const { refreshSites, selectedTaskId, getLatestRelevantTaskId, startTime } = options;

  void refreshSites(true);

  const promise = runAndWaitForTask(() => Promise.resolve(), 'site', site.id, /^Create Site/i, { startTime }).then(() => refreshSites(true));

  toastTask(promise, {
    loading: `Creating site ${site.name}...`,
    success: `Site ${site.name} created.`,
    error: `Failed to create site ${site.name}.`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(site.id);
      }
    }
  });
};
