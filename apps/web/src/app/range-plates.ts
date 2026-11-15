// Plates for a bounded range of days, watched live, for the screens that look further back than the
// week in view (Progress: the intake history). One range, never the whole store; the watch is
// dropped when the range changes or the screen goes away.
import { useEffect, useState } from 'react';
import type { EpochMs, PlateLog } from '@anc/core';
import { useSession } from './session';

export interface RangePlates {
  readonly plates: readonly PlateLog[];
  readonly status: 'loading' | 'ready' | 'failed';
}

/** The plates logged in `[from, to)` (both local-midnight instants). */
export function useRangePlates(from: EpochMs, to: EpochMs): RangePlates {
  const { store } = useSession();
  const key = `${from}:${to}`;
  const [state, setState] = useState<RangePlates & { readonly key: string }>({
    key: '',
    plates: [],
    status: 'loading',
  });
  useEffect(() => {
    return store.watchRange(
      { from, to },
      {
        next: (plates) => setState({ key, plates, status: 'ready' }),
        error: () => setState({ key, plates: [], status: 'failed' }),
      },
    );
  }, [store, key, from, to]);
  // A range just changed: nothing is shown for it until its own plates arrive.
  return state.key === key ? state : { plates: [], status: 'loading' };
}
