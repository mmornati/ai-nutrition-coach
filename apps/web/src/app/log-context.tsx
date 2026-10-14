import { createContext, useContext } from 'react';

export interface LogState {
  /** Open the "Log a plate" sheet (Snapshot, Barcode, Type it). */
  readonly open: () => void;
  /** A photo is being read: the open station shows "Reading the plate…". */
  readonly resolving: boolean;
}

export const LogContext = createContext<LogState | null>(null);

export function useLog(): LogState {
  const log = useContext(LogContext);
  if (log === null) throw new Error('useLog needs a <LogHost>');
  return log;
}
