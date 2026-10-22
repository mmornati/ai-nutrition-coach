import { useMemo, useState } from 'react';
import {
  addCalendarDays,
  copyDrafts,
  instantForSlot,
  isSameLocalDay,
  mealSlotForHour,
  slotsAvailable,
  type EpochMs,
  type MealSlot,
  type PlateLog,
} from '@anc/core';
import { Button } from '../../components/primitives';
import { Sheet } from '../../components/sheets';
import { formatDayMonth, weekdayName } from '../../components/day/format';
import { capitalise, fill, useMessage, useStrings } from '../../i18n';
import { slotName } from '../../i18n/sentences';
import { useDay } from '../../app/day-context';
import { navigate, TODAY_HASH } from '../../app/router';
import { useSession } from '../../app/session';
import { ChoiceGroup } from '../settings/ChoiceGroup';

/** Today and the six days before it: the week the app keeps in view. */
const WEEK_DAYS = 7;

/**
 * "Log this again": a NEW plate with the same foods, amounts and nutrient snapshots, on today
 * (the default, right now when the meal fits the hour) or on another day of the week, in the meal
 * you choose. It goes through the normal record path, so the coach reads it like any plate.
 */
export function CopyPlateSheet({
  open,
  plate,
  onClose,
}: {
  readonly open: boolean;
  readonly plate: PlateLog;
  readonly onClose: () => void;
}) {
  const all = useStrings();
  const t = all.relog;
  const { recordPlate, clock } = useSession();
  const day = useDay();
  const originalSlot = mealSlotForHour(new Date(plate.loggedAtUtc).getHours());
  const [target, setTarget] = useState<EpochMs>(day.today);
  const [slot, setSlot] = useState<MealSlot>(() => mealSlotForHour(new Date(clock()).getHours()));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useMessage();

  const dayChoices = useMemo(
    () =>
      Array.from({ length: WEEK_DAYS }, (_, i) => {
        const d = addCalendarDays(day.today, -i);
        return {
          value: String(d),
          label: i === 0 ? t.dayToday : `${capitalise(weekdayName(d))} ${formatDayMonth(d)}`, // French weekdays are lower-case
        };
      }),
    [day.today, t.dayToday],
  );
  // Never a plate in the future: on today only the meals that have started are offered (the
  // current one lands at now, earlier ones at their usual hour). "Late" is offered when the
  // plate was late or it is late now.
  const now = clock();
  const clockSlot = mealSlotForHour(new Date(now).getHours());
  const candidates: readonly MealSlot[] =
    originalSlot === 'late' || clockSlot === 'late'
      ? ['breakfast', 'lunch', 'dinner', 'late']
      : ['breakfast', 'lunch', 'dinner'];
  const slots = slotsAvailable({ day: target, now, candidates });
  // The chosen meal is always one of the radios: else the plate's own, else the first offered.
  const chosen: MealSlot = slots.includes(slot)
    ? slot
    : slots.includes(originalSlot)
      ? originalSlot
      : (slots[0] ?? clockSlot);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    let recorded: boolean;
    try {
      const result = await recordPlate(
        copyDrafts(plate.entries),
        instantForSlot({ day: target, slot: chosen, now }),
      );
      recorded = result.kind === 'recordPlateSuccess';
    } catch {
      recorded = false;
    }
    setBusy(false);
    if (!recorded) {
      setNote((a) => a.common.logFailed);
      return;
    }
    const meal = slotName(chosen);
    const today = isSameLocalDay(target, day.today);
    const label = `${weekdayName(target)} ${formatDayMonth(target)}`;
    day.select(target);
    day.setNotice((a) =>
      today
        ? fill(a.relog.againDoneToday, { meal })
        : fill(a.relog.againDoneOther, { meal, day: label }),
    );
    onClose();
    navigate(TODAY_HASH);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.againTitle}>
      <p className="text-body-small text-porcelain-dim">{t.againIntro}</p>
      <ChoiceGroup
        label={t.whichDay}
        choices={dayChoices}
        value={String(target)}
        onChange={(value) => setTarget(Number(value))}
      />
      <ChoiceGroup
        label={t.whichMeal}
        choices={slots.map((s) => ({ value: s, label: slotName(s) }))}
        value={chosen}
        onChange={setSlot}
      />
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {note}
      </p>
      <Button fullWidth busy={busy} busyLabel={all.common.logging} onClick={() => void submit()}>
        {t.againConfirm}
      </Button>
    </Sheet>
  );
}
