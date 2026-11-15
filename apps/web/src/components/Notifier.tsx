import type { ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { useMediaQuery } from '@mui/material';

export type NotifySeverity = 'success' | 'error' | 'warning' | 'info';
type Notify = (msg: string, severity?: NotifySeverity) => void;

const notify: Notify = (msg, severity = 'info') => {
  const opts = { duration: severity === 'error' ? 8000 : severity === 'warning' ? 6000 : 3500 };
  if (severity === 'success') toast.success(msg, opts);
  else if (severity === 'error') toast.error(msg, opts);
  else if (severity === 'warning') toast.warning(msg, opts);
  else toast.info(msg, opts);
};

/** Sonner toasts: stacked, swipe to dismiss, kept clear of the top bar and the map controls. */
export function NotifierProvider({ children }: { children: ReactNode }) {
  const mobile = useMediaQuery('(max-width:899px)');
  return (
    <>
      {children}
      <Toaster
        theme="dark"
        richColors
        closeButton
        position={mobile ? 'top-center' : 'bottom-right'}
        offset={mobile ? 60 : 24}
        mobileOffset={{ top: 60, left: 12, right: 12 }}
        visibleToasts={3}
        toastOptions={{ style: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13 } }}
      />
    </>
  );
}

/** Same API as before, so callers stay unchanged. */
export const useNotify = () => notify;

/** Loading toast that turns into success/error when the promise settles. */
export function notifyPromise<T>(p: Promise<T>, msgs: { loading: string; success: string | ((v: T) => string); error: (e: unknown) => string }) {
  toast.promise(p, msgs);
  return p;
}
