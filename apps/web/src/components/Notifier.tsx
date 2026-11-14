import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Alert, Snackbar, type AlertColor } from '@mui/material';

type Notify = (msg: string, severity?: AlertColor) => void;
const Ctx = createContext<Notify>(() => undefined);

export function NotifierProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; severity: AlertColor; key: number } | null>(null);
  const notify = useCallback<Notify>((text, severity = 'info') => setMsg({ text, severity, key: Date.now() }), []);
  return (
    <Ctx.Provider value={notify}>
      {children}
      <Snackbar
        key={msg?.key}
        open={!!msg}
        autoHideDuration={5000}
        onClose={(_, r) => r !== 'clickaway' && setMsg(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {msg ? (
          <Alert severity={msg.severity} variant="filled" onClose={() => setMsg(null)} data-testid="notification">
            {msg.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Ctx.Provider>
  );
}

export const useNotify = () => useContext(Ctx);
