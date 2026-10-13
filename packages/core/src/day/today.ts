import type { Clock, EpochMs, Unsubscribe } from '../common';
import { msUntilNextLocalMidnight, startOfLocalDay } from '../value-types/calendar-day';

/** 00:00 local of the current calendar day, per the injected clock. The one definition of "today". */
export function todayOf(clock: Clock): EpochMs {
  return startOfLocalDay(clock());
}

/** Arms a one-shot timer. Implemented by the web app (`setTimeout`); injected so core stays pure. */
export type Schedule = (callback: () => void, delayMs: number) => Unsubscribe;

/** What `watchToday` returns. */
export interface TodayWatch {
  /** Stops the timer; a late fire is ignored. Safe to call more than once. */
  readonly cancel: Unsubscribe;
  /** Recomputes today now (call on `visibilitychange` / focus: timers stall while suspended). */
  readonly recheck: () => void;
}

/**
 * Keeps "today" current: calls `onChange` with the new day when the clock crosses local
 * midnight, so a board left open overnight rolls over. The timer targets the next local midnight
 * (calendar arithmetic, DST-safe) and re-reads the clock when it fires; an early or late fire
 * simply re-arms, and the timer is re-armed even when `onChange` throws. `recheck` does the same
 * comparison immediately, for when the app returns to the foreground.
 */
export function watchToday(deps: {
  readonly clock: Clock;
  readonly schedule: Schedule;
  readonly onChange: (today: EpochMs) => void;
}): TodayWatch {
  let current = todayOf(deps.clock);
  let cancelTimer: Unsubscribe | undefined;
  let stopped = false;

  const check = (): void => {
    const next = todayOf(deps.clock);
    if (next !== current) {
      current = next;
      deps.onChange(next);
    }
  };

  const arm = (): void => {
    cancelTimer = deps.schedule(() => {
      if (stopped) return;
      try {
        check();
      } finally {
        if (!stopped) arm();
      }
    }, msUntilNextLocalMidnight(deps.clock()));
  };

  arm();
  return {
    cancel: () => {
      stopped = true;
      cancelTimer?.();
    },
    recheck: () => {
      if (stopped) return;
      try {
        check();
      } finally {
        // A rollover just seen here makes the pending timer stale; re-arm for the next midnight.
        cancelTimer?.();
        arm();
      }
    },
  };
}
