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
  /** The last seven days' plates, newest first. */
  readonly plates: readonly PlateLog[];
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
  const [plates, setPlates] = useState<readonly PlateLog[]>([]);
  const [status, setStatus] = useState<PlatesStatus>('loading');
  const [notice, setNotice] = useMessage();
  const [lastLoggedAt, setLastLoggedAt] = useState<number | null>(null);
  const [durableSeen, setDurableSeen] = useState(false);

  useEffect(() => {
    return store.watchRange(
      { from: addCalendarDays(today, -6), to: startOfNextLocalDay(today) },
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
  }, [store, today]);

  // A selection older than the week (the day rolled over under it) falls back to today.
  const selected =
    chosen !== null && chosen >= addCalendarDays(today, -6) && chosen <= today ? chosen : today;

  const select = useCallback((day: EpochMs) => setChosen(startOfLocalDay(day)), []);
  const markLogged = useCallback(() => setLastLoggedAt(Date.now()), []);
  const markDurableSeen = useCallback(() => setDurableSeen(true), []);
  const days = useMemo(() => buildWeekDays(plates, today), [plates, today]);

  const value = useMemo<DayState>(
    () => ({
      today,
      selected,
      select,
      plates,
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
      plates,
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
