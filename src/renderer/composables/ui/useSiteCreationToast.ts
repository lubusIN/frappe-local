import { toast } from 'frappe-ui';
import type { Ref } from 'vue';
import { runAndWaitForTask, useIpc } from '@frappe-local/renderer/composables/system';

export const trackSiteCreationToast = (
  site: { id: string; name: string },
  options: {
    refreshSites: (force?: boolean) => void | Promise<void>;
    selectedTaskId: Ref<string | null>;
    getLatestRelevantTaskId: (resourceId: string) => string | null;
    startTime?: number;
  }
) => {
  const ipc = useIpc();
  const { refreshSites, selectedTaskId, getLatestRelevantTaskId, startTime } = options;

  void refreshSites(true);

  const promise = runAndWaitForTask(() => Promise.resolve(), 'site', site.id, /^Create Site/i, { startTime }).then(() => refreshSites(true));

  toast.promise(promise, {
    loading: `Creating site ${site.name}`,
    action: {
      label: 'View logs',
      onClick: (e?: Event) => {
        e?.preventDefault();
        selectedTaskId.value = getLatestRelevantTaskId(site.id);
      }
    },
    success: () => ({
      message: `Site ${site.name} created.`,
      action: {
        label: 'Open',
        onClick: (e?: Event) => {
          e?.preventDefault();
          void ipc.openSiteExternal(site.id).then((opened) => {
            if (!opened) {
              toast.error(`Unable to open ${site.name}.`);
            }
          });
        }
      }
    }),
    error: () => ({
      message: `Failed to create site ${site.name}.`,
      action: {
        label: 'View logs',
        onClick: (e?: Event) => {
          e?.preventDefault();
          selectedTaskId.value = getLatestRelevantTaskId(site.id);
        }
      }
    })
  });
};
