import { toast } from 'frappe-ui';

export function toastTask<T>(
  promise: Promise<T>,
  options: {
    id?: string | number;
    loading: string;
    success: string;
    error: string | ((err: unknown) => string);
    action?: { label: string; onClick: (e?: Event) => void };
  }
) {
  const toastId = options.id ?? toast.loading(options.loading, { action: options.action });
  if (options.id) {
    toast.loading(options.loading, { id: toastId, action: options.action });
  }
  
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
  
  const returnPromise = promise as Promise<T> & { toastId: string | number };
  returnPromise.toastId = toastId;
  return returnPromise;
}
