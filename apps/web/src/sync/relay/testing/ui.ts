// Shared by the component tests of the relay screens. Test-only (nothing in the app imports it).
import type { SyncConfigBody } from '@anc/core';
import { SyncOfferSource } from '../offer';
import type { SyncEvents, SyncTimers } from '../sync-service';

export const OPEN_CONFIG: SyncConfigBody = {
  enabled: true,
  v: 1,
  identity: 'handle',
  signup: 'open',
  maxVaultMb: 20,
};

/** An offer source that reads `config` from a fake `/sync/config.json` (or a 404 for `null`). */
export function offerOf(config: unknown | null): SyncOfferSource {
  return new SyncOfferSource({
    fetch: () =>
      Promise.resolve(
        config === null
          ? new Response('<!doctype html>', {
              status: 200,
              headers: { 'content-type': 'text/html' },
            })
          : new Response(JSON.stringify(config), { status: 200 }),
      ),
  });
}

/** Timers and page events that never fire by themselves. */
export function inertSync(): { timers: SyncTimers; events: SyncEvents } {
  return {
    timers: { set: () => () => undefined },
    events: { onHidden: () => () => undefined, onOnline: () => () => undefined },
  };
}
