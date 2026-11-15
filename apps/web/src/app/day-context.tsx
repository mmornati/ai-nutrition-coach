// The week's plates and the selected day, shared by Today, Week, Plate and the dock's route.
// One watch of the last seven days feeds all of them (Today reads its day out of it); the watch
// re-emits on every change, so a plate that was just logged appears with no refresh.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  addCalendarDays,
  isSameLocalDay,
  startOfLocalDay,
  startOfNextLocalDay,
  todayOf,
  watchToday,
  type EpochMs,
  type PlateLog,
} from '@anc/core';
import { buildWeekDays, type WeekDayData } from '../components/day';
import { useMessage, type Message } from '../i18n';
import { useSession } from './session';

export type PlatesStatus = 'loading' | 'ready' | 'failed';

export interface DayState {
  /** 00:00 local of today, kept current across midnight. */
  readonly today: EpochMs;
  /** The day Today shows (00:00 local). */
  readonly selected: EpochMs;
  readonly select: (day: EpochMs) => void;
  /**
   * Where a new plate lands: the day the person explicitly picked in the strip (or opened from a
   * link), else today. Browsing an earlier week never moves it.
   */
  readonly logDay: EpochMs;
  /** The plates of the seven days in view (the week ending `viewEnd`), newest first. */
  readonly plates: readonly PlateLog[];
  /** The last day of the seven in view: today, or an earlier day when an earlier week is shown. */
  readonly viewEnd: EpochMs;
  /** An earlier week is in view (the day board, the dock's route and the week screen follow it). */
  readonly viewingEarlierWeek: boolean;
  /** Move the week in view back or forward by seven days (never past the week ending today). */
  readonly shiftWeek: (direction: -1 | 1) => void;
  /** Back to the week ending today and the day today: one tap from anywhere. */
  readonly goToToday: () => void;
  /** Show a day wherever it is: the week that holds it comes into view and the day is selected. */
  readonly showDay: (day: EpochMs) => void;
  readonly status: PlatesStatus;
  readonly days: readonly WeekDayData[];
  /** One calm line shown on Today (a plate was removed, or could not be). */
  readonly notice: string | null;
  /** Takes a `Message` (worded at display time), so the line follows the locale. */
  readonly setNotice: (message: Message | null) => void;
  /** When the last plate was logged, for the short-lived "+ log another plate" link. */
  readonly lastLoggedAt: number | null;
  readonly markLogged: () => void;
  /** The durable-storage line was on screen long enough: it is not shown again this session. */
  readonly durableSeen: boolean;
  readonly markDurableSeen: () => void;
}

const DayContext = createContext<DayState | null>(null);

export function useDay(): DayState {
  const day = useContext(DayContext);
  if (day === null) throw new Error('useDay needs a <DayProvider>');
  return day;
}

const schedule = (callback: () => void, delayMs: number): (() => void) => {
  const id = setTimeout(callback, delayMs);
  return () => clearTimeout(id);
};

/** "Today" as a number that rolls over at local midnight, including after a suspended tab wakes. */
export function useToday(clock: () => number): EpochMs {
  const [today, setToday] = useState(() => todayOf(clock));
  useEffect(() => {
    const watch = watchToday({ clock, schedule, onChange: setToday });
    const onVisible = () => {
      if (document.visibilityState === 'visible') watch.recheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      watch.cancel();
    };
  }, [clock]);
  return today;
}

export function DayProvider({ children }: { children: ReactNode }) {
  const { store, clock } = useSession();
  const today = useToday(clock);
  const [chosen, setChosen] = useState<EpochMs | null>(null);
  // The last day of the week in view; `null` follows today (across midnight too). An earlier week
  // is anchored to its own day, so it does not slide when the clock rolls over.
  const [endChosen, setEndChosen] = useState<EpochMs | null>(null);
  const [plates, setPlates] = useState<readonly PlateLog[]>([]);
  const [status, setStatus] = useState<PlatesStatus>('loading');
  const [notice, setNotice] = useMessage();
  const [lastLoggedAt, setLastLoggedAt] = useState<number | null>(null);
  const [durableSeen, setDurableSeen] = useState(false);

  const viewEnd = endChosen !== null && endChosen < today ? endChosen : today;

  useEffect(() => {
    return store.watchRange(
      { from: addCalendarDays(viewEnd, -6), to: startOfNextLocalDay(viewEnd) },
      {
        next: (value) => {
          setPlates(value);
          setStatus('ready');
        },
        error: () => {
          setPlates([]);
          setStatus('failed');
        },
      },
    );
  }, [store, viewEnd]);

  // A selection outside the week in view (the day rolled over under it, or another week was
  // chosen) falls back to the last day of that week: today, for the current one.
  const selected =
    chosen !== null && chosen >= addCalendarDays(viewEnd, -6) && chosen <= viewEnd
      ? chosen
      : viewEnd;

  const logDay = chosen !== null && selected === chosen ? chosen : today;

  const select = useCallback((day: EpochMs) => setChosen(startOfLocalDay(day)), []);
  const shiftWeek = useCallback(
    (direction: -1 | 1) => {
      setChosen(null);
      setEndChosen((current) => {
        const base = current !== null && current < today ? current : today;
        const next = addCalendarDays(base, 7 * direction);
        return next >= today ? null : next;
      });
    },
    [today],
  );
  const goToToday = useCallback(() => {
    setChosen(null);
    setEndChosen(null);
  }, []);
  const showDay = useCallback(
    (day: EpochMs) => {
      const target = startOfLocalDay(day);
      if (target >= today) {
        setEndChosen(null);
        setChosen(null);
        return;
      }
      // The week that holds it ends at the day `7 * k` days before today, the first whose window includes it.
      const back = Math.round((today - target) / 86_400_000);
      const end = addCalendarDays(today, -7 * Math.floor(back / 7));
      setEndChosen(end >= today ? null : end);
      setChosen(target);
    },
    [today],
  );
  const markLogged = useCallback(() => setLastLoggedAt(Date.now()), []);
  const markDurableSeen = useCallback(() => setDurableSeen(true), []);
  const days = useMemo(() => buildWeekDays(plates, today, viewEnd), [plates, today, viewEnd]);

  const value = useMemo<DayState>(
    () => ({
      today,
      selected,
      select,
      logDay,
      plates,
      viewEnd,
      viewingEarlierWeek: viewEnd !== today,
      shiftWeek,
      goToToday,
      showDay,
      status,
      days,
      notice,
      setNotice,
      lastLoggedAt,
      markLogged,
      durableSeen,
      markDurableSeen,
    }),
    [
      today,
      selected,
      select,
      logDay,
      plates,
      viewEnd,
      shiftWeek,
      goToToday,
      showDay,
      status,
      days,
      notice,
      setNotice,
      lastLoggedAt,
      markLogged,
      durableSeen,
      markDurableSeen,
    ],
  );
  return <DayContext.Provider value={value}>{children}</DayContext.Provider>;
}

export const isToday = (day: DayState, date: EpochMs): boolean => isSameLocalDay(date, day.today);

/** Clears a notice after a few seconds (a calm line, not a toast that must be dismissed). */
export function useNoticeTimeout(notice: string | null, clear: () => void, ms = 6000): void {
  const clearRef = useRef(clear);
  useEffect(() => {
    clearRef.current = clear;
  });
  useEffect(() => {
    if (notice === null) return;
    const id = setTimeout(() => clearRef.current(), ms);
    return () => clearTimeout(id);
  }, [notice, ms]);
}
