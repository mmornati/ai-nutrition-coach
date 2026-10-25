// What the sync service says, as the screens need it: the header chip for the device as a whole, and
// the status of each plate (AD-6: `synced` only once the relay acknowledged a snapshot that held it).
// Both are read from the session's sync service and its `SyncQueue`; nothing here talks to a server.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { SyncOpStatus, SyncOpStatusValue } from '@anc/core';
import { headerChipOf, type HeaderChip } from '../sync';
import { useSession } from './session';

/** The device-level chip: "On this device" until connected, then pending, synced, retry later or update. */
export function useHeaderChip(): HeaderChip {
  const { sync } = useSession();
  const status = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  return useMemo(() => headerChipOf(status), [status]);
}

export interface PlateSyncStatuses {
  /** Whether this device is connected to a server copy (no chips per plate otherwise). */
  readonly hasTransport: boolean;
  /** A plate the ledger has not seen yet is `pending`, never `synced`. */
  readonly statusOf: (plateLogId: number) => SyncOpStatusValue;
  readonly pending: number;
  readonly retryLater: number;
}

const NONE: readonly SyncOpStatus[] = Object.freeze([]);

export function usePlateSyncStatuses(): PlateSyncStatuses {
  const { sync, syncQueue } = useSession();
  const connected = useSyncExternalStore(
    sync.subscribe,
    () => sync.getSnapshot().connected,
    () => false,
  );
  const [list, setList] = useState<readonly SyncOpStatus[]>(NONE);
  useEffect(
    () =>
      syncQueue.watchPerPlate({
        next: setList,
        error: () => setList(NONE),
      }),
    [syncQueue],
  );
  return useMemo(() => {
    const byId = new Map(list.map((s) => [s.plateLogId, s.status] as const));
    let pending = 0;
    let retryLater = 0;
    for (const s of list) {
      if (s.status === 'pending') pending++;
      else if (s.status === 'failed') retryLater++;
    }
    return {
      hasTransport: connected,
      statusOf: (id) => byId.get(id) ?? 'pending',
      pending,
      retryLater,
    };
  }, [connected, list]);
}
