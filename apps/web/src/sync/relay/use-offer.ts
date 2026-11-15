import { useEffect, useSyncExternalStore } from 'react';
import type { SyncOffer } from '@anc/core';
import type { SyncOfferSource } from './offer';

/** The offer, kept current; reads `/sync/config.json` once when the screen that shows it mounts. */
export function useSyncOffer(source: SyncOfferSource): SyncOffer {
  useEffect(() => {
    void source.refresh();
  }, [source]);
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

/** Whether the server's sign-in turned the offer read away (reload the page to sign in again). */
export function useSyncSignInRequired(source: SyncOfferSource): boolean {
  return useSyncExternalStore(source.subscribe, source.getSignInRequired, source.getSignInRequired);
}

/** Whether a server that offered a copy before cannot be reached now (say so; do not hide the section). */
export function useSyncUnreachable(source: SyncOfferSource): boolean {
  return useSyncExternalStore(source.subscribe, source.getUnreachable, source.getUnreachable);
}
