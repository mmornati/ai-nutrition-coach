// "Start fresh from the server copy" erases this device, which tears the unlocked session down. The
// copy the person already opened (and the passphrase that will become this device's) must outlive
// that, so the Gate holds them for the one step that follows the erase: restoring them into the new
// store. They live in memory only, are used once, and are wiped.
import { createContext, useContext } from 'react';
import type { OpenedServerCopy } from '../sync';

export interface ServerHandoff {
  /** Called just before the erase: the first-run state that follows restores this copy. */
  begin(copy: OpenedServerCopy, passphrase: string): void;
  /** The erase did not happen: forget it. */
  cancel(): void;
}

export const ServerHandoffContext = createContext<ServerHandoff | null>(null);

/** `null` outside the Gate (a screen under test): "Start fresh" is then not offered. */
export const useServerHandoff = (): ServerHandoff | null => useContext(ServerHandoffContext);
