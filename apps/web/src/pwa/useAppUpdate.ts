import { useSyncExternalStore } from 'react';
import { appUpdate } from './app-update';

/** `updateReady` is true only while a newer worker waits; `applyUpdate` is the Reload action. */
export function useAppUpdate(): { updateReady: boolean; applyUpdate: () => Promise<void> } {
  const signal = appUpdate();
  const updateReady = useSyncExternalStore(signal.subscribe, signal.getUpdateReady);
  return { updateReady, applyUpdate: signal.applyUpdate };
}
