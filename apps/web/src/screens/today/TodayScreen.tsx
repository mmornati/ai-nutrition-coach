import { useEffect, useMemo, useState } from 'react';
import {
  addCalendarDays,
  classifyForDate,
  isSameLocalDay,
  MEAL_SLOTS,
  mealSlotForHour,
  openPlateDismissalKey,
  visibleSlots,
  type MealSlot,
  type PlateLog,
} from '@anc/core';
import {
  LineLegend,
  LineMap,
  NoStreaksLine,
  OpenStation,
  PlateRow,
  WeekNetwork,
  WeekNoteText,
  weekNoteParts,
  type LineMapStation,
} from '../../components/day';
import { formatDayMonth, weekdayName } from '../../components/day/format';
import { RemovePlateDialog } from '../../components/dialogs';
import { useStrings } from '../../i18n';
import { useDay, useNoticeTimeout } from '../../app/day-context';
import { useLog } from '../../app/log-context';
import { hrefs, navigate } from '../../app/router';
import { ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { useSession } from '../../app/session';
import { useStoreSnapshot } from '../../app/store-context';
import { PlateCoach, useDismissals } from './coach';
import { plateSummary } from '../plate/summary';

const QUICK_REPEAT_MS = 5000;

/** The quiet line after a log: "+ log another plate", gone after five seconds. */
function QuickRepeat({ at, onOpen }: { readonly at: number | null; readonly onOpen: () => void }) {
  const s = useStrings().today;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const left = QUICK_REPEAT_MS - (Date.now() - at);
    if (left <= 0) return;
    const tick = setTimeout(() => setNow(Date.now()), left + 20);
    return () => clearTimeout(tick);
  }, [at]);
  if (at === null || now - at >= QUICK_REPEAT_MS) return null;
  return (
    <button
      type="button"
      aria-label={s.logAnother}
      onClick={onOpen}
      className="text-porcelain-dim mx-5 mt-3 inline-flex min-h-12 cursor-pointer items-center bg-transparent text-lead underline underline-offset-4 lg:mx-7"
    >
      {s.logAnotherLink}
    </button>
  );
}

/** How long the durable-storage line stays before it is retired for this session. */
const DURABLE_LINE_MS = 10_000;

/** The durable-storage answer: one plain line, once per unlocked session, never a nag. */
function DurableLine() {
  const s = useStrings().durable;
  const { durable } = useStoreSnapshot();
  const day = useDay();
  const { durableSeen, markDurableSeen } = day;
  const known = durable === 'persisted' || durable === 'notPersisted';
  const visible = known && !durableSeen;
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(markDurableSeen, DURABLE_LINE_MS);
    return () => clearTimeout(id);
  }, [visible, markDurableSeen]);
  const line = !visible ? '' : durable === 'persisted' ? s.persisted : s.notPersisted;
  return (
    <p role="status" className="text-signal-muted mx-5 mt-3 text-meta empty:hidden lg:mx-7">
      {line}
    </p>
  );
}

/**
 * Today: the selected day as a transit map. One station per plate, an open station for every meal
 * not yet logged, the week network beside it on desktop. No scores, no streaks, no totals.
 */
export function TodayScreen() {
  const all = useStrings();
  const s = all.today;
  const { deletePlate, coach, coachInteractions, notes } = useSession();
  const day = useDay();
  const log = useLog();
  const dismissed = useDismissals(notes);
  const [removing, setRemoving] = useState<PlateLog | null>(null);
  const [busy, setBusy] = useState(false);

  useNoticeTimeout(day.notice, () => day.setNotice(null));

  const viewingToday = isSameLocalDay(day.selected, day.today);
  const title = viewingToday
    ? s.today
    : isSameLocalDay(day.selected, addCalendarDays(day.today, -1))
      ? s.yesterday
      : weekdayName(day.selected);

  const board = useMemo(
    () => classifyForDate(day.plates, day.selected),
    [day.plates, day.selected],
  );
  const nowSlot: MealSlot = mealSlotForHour(new Date().getHours());

  const { stations, slotOf } = useMemo(() => {
    const out: LineMapStation[] = [];
    const slots = new Map<string, { slot: MealSlot; plate: PlateLog | null }>();
    for (const entry of visibleSlots(board)) {
      if (entry.plates.length === 0) {
        const id = `open-${entry.slot}`;
        const resolving = log.resolving && viewingToday && entry.slot === nowSlot;
        out.push({ id, status: resolving ? 'resolving' : 'open' });
        slots.set(id, { slot: entry.slot, plate: null });
        continue;
      }
      for (const plate of entry.plates) {
        const id = `plate-${plate.id}`;
        out.push({ id, status: 'logged', plate });
        slots.set(id, { slot: entry.slot, plate });
      }
    }
    // The meal being read already has a plate (or is `late`, which is only shown once used): the
    // new station arrives after the others.
    if (log.resolving && viewingToday && !out.some((st) => st.status === 'resolving')) {
      out.push({ id: 'resolving', status: 'resolving' });
      slots.set('resolving', { slot: nowSlot, plate: null });
    }
    return { stations: out, slotOf: slots };
  }, [board, log.resolving, viewingToday, nowSlot]);

  // The coach hint belongs to the first open meal from now on (today only); once dismissed it
  // stays dismissed. A meal already behind us never gets a nudge.
  const hintStation = viewingToday
    ? stations.find((st) => {
        const slot = slotOf.get(st.id)?.slot;
        return (
          st.status === 'open' &&
          slot !== undefined &&
          slot !== 'late' &&
          MEAL_SLOTS.indexOf(slot) >= MEAL_SLOTS.indexOf(nowSlot)
        );
      })?.id
    : undefined;
  const hintQuestion = useMemo(() => {
    const r = coach.questionFor({ anchor: 'openPlate', pattern: 'balanced' });
    return r.kind === 'coachFound' ? r.question.text : null;
  }, [coach]);

  const remove = async () => {
    const plate = removing;
    if (!plate || busy) return;
    setBusy(true);
    try {
      const result = await deletePlate(plate.id);
      day.setNotice(result.kind === 'plateDeleted' ? s.plateRemoved : s.plateRemoveFailed);
    } catch {
      day.setNotice(s.plateRemoveFailed);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  const weekNote = weekNoteParts(day.days);

  return (
    <ScreenFrame
      current="today"
      header={<ScreenHeader title={title} sub={formatDayMonth(day.selected)} />}
    >
      <DurableLine />
      <p role="status" className="text-signal-muted mx-5 mt-3 text-meta empty:hidden lg:mx-7">
        {day.notice}
      </p>
      <QuickRepeat at={day.lastLoggedAt} onOpen={log.open} />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 pb-6">
          {day.status === 'failed' ? (
            <p className="text-porcelain-dim px-5 pt-6 text-lead lg:px-7">{s.historyCannotLoad}</p>
          ) : (
            <>
              <LineLegend className="lg:px-7" />
              <LineMap
                className="px-0 lg:pl-3"
                stations={stations}
                renderStation={(st) => {
                  const entry = slotOf.get(st.id);
                  if (!entry) return null;
                  if (st.status === 'logged' && entry.plate) {
                    const plate = entry.plate;
                    return (
                      <PlateRow
                        plate={plate}
                        slot={entry.slot}
                        hasTransport={false}
                        onOpen={(id) => navigate(hrefs.plate(id))}
                        onRequestDelete={() => setRemoving(plate)}
                      >
                        <PlateCoach plate={plate} dismissed={dismissed} />
                      </PlateRow>
                    );
                  }
                  const key = openPlateDismissalKey({ day: day.selected, slotName: entry.slot });
                  const showHint =
                    st.id === hintStation && hintQuestion !== null && !dismissed.has(key);
                  return (
                    <OpenStation
                      slot={entry.slot}
                      resolving={st.status === 'resolving'}
                      hint={showHint ? hintQuestion : null}
                      onDismissHint={() => void coachInteractions.dismissOpenPlateHint(key)}
                    />
                  );
                }}
              />
            </>
          )}
          <a
            href={hrefs.week}
            className="text-porcelain-dim mx-5 mt-2 inline-flex min-h-12 items-center text-lead underline underline-offset-4 lg:hidden"
          >
            {s.seeWeekNetwork}
          </a>
        </section>
        <section className="border-rule hidden px-7 pt-6 lg:block lg:border-l-2">
          <h2 className="font-display text-section text-signal-muted mb-4 uppercase">
            {s.networkHeading}
          </h2>
          <WeekNetwork days={day.days} />
          <WeekNoteText lead={weekNote.lead} detail={weekNote.detail} className="mt-4" />
          <NoStreaksLine className="mt-4" />
        </section>
      </div>
      <RemovePlateDialog
        open={removing !== null}
        dish={removing ? plateSummary(removing) : ''}
        busy={busy}
        onKeep={() => setRemoving(null)}
        onRemove={() => void remove()}
      />
    </ScreenFrame>
  );
}
