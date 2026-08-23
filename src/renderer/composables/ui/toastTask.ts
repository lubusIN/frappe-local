import { toast } from 'frappe-ui';

export function toastTask<T>(
  promise: Promise<T>,
  options: {
    loading: string;
    success: string;
    error: string | ((err: unknown) => string);
    action?: { label: string; onClick: (e?: Event) => void };
  }
) {
  const toastId = toast.loading(options.loading, { action: options.action });
  
  promise.then(() => {
    toast.success(options.success, { id: toastId, action: options.action });
  }).catch((err) => {
    if (err && err.name === 'TaskCancelledError') {
      toast.dismiss(toastId);
    } else {
      const errorMsg = typeof options.error === 'function' ? options.error(err) : options.error;
      toast.error(errorMsg, { id: toastId, action: options.action });
    }
  });
  
  return promise;
}
