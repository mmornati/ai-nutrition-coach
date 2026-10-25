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
