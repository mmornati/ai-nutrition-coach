import { useMemo, useSyncExternalStore } from 'react';
import {
  fastFallSafeguard,
  localDayText,
  paceNoticeDismissed,
  weightProgress,
  type BodyMeasurement,
  type UnitSystem,
  type WeightProgress,
} from '@anc/core';
import { useSession } from '../../app/session';

/** Every dated measurement, newest day first, following the store live. */
export function useMeasurements(): readonly BodyMeasurement[] {
  const { profile } = useSession();
  return useSyncExternalStore(profile.subscribe, profile.measurementList);
}

/** The person's display units (metric unless they chose imperial). */
export function useUnits(): UnitSystem {
  const { profile } = useSession();
  const current = useSyncExternalStore(profile.subscribe, profile.current);
  return current?.units ?? 'metric';
}

/** The trend, its changes and its pace, worked out from the weigh-ins alone. */
export function useWeightProgress(): WeightProgress {
  const body = useMeasurements();
  return useMemo(
    () =>
      weightProgress(
        body.filter((m) => m.kind === 'weight').map((m) => ({ day: m.day, value: m.value })),
      ),
    [body],
  );
}

/**
 * Whether the calm pace line is shown now: the safeguard holds today (enough history, and a latest
 * weigh-in at most 14 days old, so the line does not outlive its data) and it was not hidden in the
 * last 14 days.
 */
export function usePaceNoticeVisible(): boolean {
  const { notices, clock } = useSession();
  const state = useSyncExternalStore(notices.subscribe, notices.snapshot);
  const progress = useWeightProgress();
  const today = localDayText(clock());
  return useMemo(
    () =>
      fastFallSafeguard(progress.series, today) &&
      !paceNoticeDismissed(state.paceDismissedAt, clock()),
    [progress.series, today, state.paceDismissedAt, clock],
  );
}

/** The local day text for today (`yyyy-MM-dd`), from the session clock. */
export function useTodayText(): string {
  const { clock } = useSession();
  return localDayText(clock());
}
