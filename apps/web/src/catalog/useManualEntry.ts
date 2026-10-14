import { useMemo, useSyncExternalStore } from 'react';
import type { FoodCatalog } from '@anc/core';
import { ManualEntrySession, type ManualEntryState } from './manual-entry';

/** Binds a {@link ManualEntrySession} to a component. The session lives as long as the catalog. */
export function useManualEntry(catalog: FoodCatalog): {
  readonly session: ManualEntrySession;
  readonly state: ManualEntryState;
} {
  const session = useMemo(() => new ManualEntrySession(catalog), [catalog]);
  const state = useSyncExternalStore(session.subscribe, () => session.state);
  return { session, state };
}
