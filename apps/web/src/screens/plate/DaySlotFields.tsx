import { useMemo, useState } from 'react';
import {
  addCalendarDays,
  isSameLocalDay,
  mealSlotForHour,
  slotsAvailable,
  type EpochMs,
  type MealSlot,
} from '@anc/core';
import { formatDayMonth, weekdayName } from '../../components/day/format';
import { capitalise, useStrings } from '../../i18n';
import { slotName } from '../../i18n/sentences';
import { useDay } from '../../app/day-context';
import { useSession } from '../../app/session';
import { ChoiceGroup } from '../settings/ChoiceGroup';

/** Today and the six days before it: the week the app keeps in view. */
export const WEEK_DAYS = 7;

const ALL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'late'];

export interface DaySlotChoice {
  readonly day: EpochMs;
  readonly setDay: (day: EpochMs) => void;
  /** Always one of `slots`. */
  readonly slot: MealSlot;
  readonly setSlot: (slot: MealSlot) => void;
  readonly slots: readonly MealSlot[];
}

/**
 * Which meals can be offered for `day` and which one is chosen: `wanted` when it is offered,
 * else `keep`, else the first offered. Pure, so the log sheet (which keeps its own state) and the
 * edit sheet share one rule.
 *
 * Never a plate in the future: on today only the meals that have started are offered (the current
 * one lands at "now", earlier ones at their usual hour). `keep` is the meal the plate being edited
 * is already in; the caller passes it only while the chosen day is the plate's own day, where
 * leaving it alone keeps its real time. "Late" is offered when it is late now, or `keep` or
 * `wanted` say so.
 */
export function slotChoices(input: {
  readonly day: EpochMs;
  readonly now: EpochMs;
  readonly wanted: MealSlot;
  readonly keep?: MealSlot | undefined;
}): { readonly slots: readonly MealSlot[]; readonly slot: MealSlot } {
  const { day, now, wanted, keep } = input;
  const clockSlot = mealSlotForHour(new Date(now).getHours());
  const candidates = ALL_SLOTS.filter(
    (s) => s !== 'late' || clockSlot === 'late' || keep === 'late' || wanted === 'late',
  );
  const available = slotsAvailable({ day, now, candidates });
  const slots =
    keep !== undefined && !available.includes(keep)
      ? [...available, keep].sort((a, b) => ALL_SLOTS.indexOf(a) - ALL_SLOTS.indexOf(b))
      : available;
  const slot: MealSlot = slots.includes(wanted)
    ? wanted
    : keep !== undefined && slots.includes(keep)
      ? keep
      : (slots[0] ?? clockSlot);
  return { slots, slot };
}

export function useDaySlot(initial: {
  readonly day: EpochMs;
  readonly slot: MealSlot;
  readonly keep?: MealSlot | undefined;
}): DaySlotChoice {
  const { clock } = useSession();
  const [day, setDay] = useState<EpochMs>(initial.day);
  const [wanted, setSlot] = useState<MealSlot>(initial.slot);
  // The plate's own meal stays an option only on the plate's own day: moved to another day, a
  // "keep" would put (for example) yesterday's 19:00 dinner at 19:00 today, which may not have come.
  const keep = isSameLocalDay(day, initial.day) ? initial.keep : undefined;
  const { slots, slot } = slotChoices({ day, now: clock(), wanted, keep });
  return { day, setDay, slot, setSlot, slots };
}

/** The "Which day" and "Which meal" choices. */
export function DaySlotFields({ choice }: { readonly choice: DaySlotChoice }) {
  const t = useStrings().relog;
  const dayState = useDay();
  const dayChoices = useMemo(
    () =>
      Array.from({ length: WEEK_DAYS }, (_, i) => {
        const d = addCalendarDays(dayState.today, -i);
        return {
          value: String(d),
          label: i === 0 ? t.dayToday : `${capitalise(weekdayName(d))} ${formatDayMonth(d)}`, // French weekdays are lower-case
        };
      }),
    [dayState.today, t.dayToday],
  );
  return (
    <>
      <ChoiceGroup
        label={t.whichDay}
        choices={dayChoices}
        value={String(choice.day)}
        onChange={(value) => choice.setDay(Number(value))}
      />
      <ChoiceGroup
        label={t.whichMeal}
        choices={choice.slots.map((s) => ({ value: s, label: slotName(s) }))}
        value={choice.slot}
        onChange={choice.setSlot}
      />
    </>
  );
}
