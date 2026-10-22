import { useEffect, useId, useState } from 'react';
import {
  addCalendarDays,
  frequentFoods,
  OFTEN_WINDOW_DAYS,
  recentFoods,
  startOfNextLocalDay,
  type FoodMatch,
  type FoodUse,
} from '@anc/core';
import { foodName } from '../../catalog';
import { entryQuantityText } from '../../components/nutrition';
import { GroupMarker } from '../../components/primitives';
import { fill, plural, useLocale, useStrings } from '../../i18n';
import { useDay } from '../../app/day-context';
import { useSession } from '../../app/session';

interface Recents {
  readonly recent: readonly FoodUse[];
  readonly often: readonly FoodUse[];
}

const NONE: Recents = { recent: [], often: [] };

/**
 * The last 30 days of plates in ONE range read (served by the plate-time index), folded into the
 * last ten distinct foods and the ten most frequent. Reads never fail the sheet: an unreadable
 * history is simply no shortcuts.
 */
function useRecents(): Recents {
  const { store, clock, live } = useSession();
  const day = useDay();
  const [recents, setRecents] = useState<Recents>(NONE);
  useEffect(() => {
    let current = true;
    const now = clock();
    void store
      .readRange({
        from: addCalendarDays(day.today, -(OFTEN_WINDOW_DAYS - 1)),
        to: startOfNextLocalDay(day.today),
      })
      .then((result) => {
        if (!current || !live() || result.kind !== 'platesRead') return;
        setRecents({
          recent: recentFoods(result.plates),
          often: frequentFoods(result.plates, { now }),
        });
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [store, clock, live, day.today]);
  return recents;
}

function Row({
  use,
  detail,
  busy,
  onLog,
  onEdit,
}: {
  readonly use: FoodUse;
  readonly detail?: string;
  readonly busy: boolean;
  readonly onLog: (use: FoodUse) => void;
  readonly onEdit: (match: FoodMatch) => void;
}) {
  const t = useStrings().relog;
  const { locale } = useLocale();
  const name = foodName(use.food, locale);
  const quantity = entryQuantityText(use.quantity, locale);
  return (
    <li className="border-seam flex items-stretch border-b">
      <button
        type="button"
        aria-label={fill(t.logRowOf, { name, quantity })}
        aria-disabled={busy || undefined}
        onClick={() => onLog(use)}
        className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 bg-transparent py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-lead">{name}</span>
          <GroupMarker group={use.food.foodGroup} className="mt-1" />
        </span>
        <span className="text-body-small text-ink-soft shrink-0 text-right">
          <span className="block">{quantity}</span>
          {detail !== undefined && <span className="block">{detail}</span>}
        </span>
      </button>
      <button
        type="button"
        aria-label={fill(t.changeAmountOf, { name })}
        onClick={() => onEdit({ food: use.food, confidence: 1, presets: [use.quantity] })}
        className="text-body-small text-ink-soft min-h-14 min-w-14 shrink-0 cursor-pointer bg-transparent px-2 underline underline-offset-4"
      >
        {t.changeAmount}
      </button>
    </li>
  );
}

/**
 * "Recent" and "Often", before anything is typed: one tap logs the food with the quantity it was
 * last logged with; "Change" opens it in the picker instead. Shows nothing without history.
 */
export function RecentFoods({
  busy,
  onLog,
  onEdit,
}: {
  readonly busy: boolean;
  readonly onLog: (use: FoodUse) => void;
  readonly onEdit: (match: FoodMatch) => void;
}) {
  const t = useStrings().relog;
  const { recent, often } = useRecents();
  const ids = useId();
  if (recent.length === 0 && often.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      {recent.length > 0 && (
        <section aria-labelledby={`${ids}-recent`} className="flex flex-col gap-1">
          <h3 id={`${ids}-recent`} className="font-display text-section text-thread mb-1">
            {t.recent}
          </h3>
          <ul className="border-ink border-t-2">
            {recent.map((use) => (
              <Row
                key={`${use.food.source}:${use.food.sourceRef}`}
                use={use}
                busy={busy}
                onLog={onLog}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </section>
      )}
      {often.length > 0 && (
        <section aria-labelledby={`${ids}-often`} className="flex flex-col gap-1">
          <h3 id={`${ids}-often`} className="font-display text-section text-thread mb-1">
            {t.often}
          </h3>
          <ul className="border-ink border-t-2">
            {often.map((use) => (
              <Row
                key={`${use.food.source}:${use.food.sourceRef}`}
                use={use}
                detail={plural(t.oftenTimes, use.count)}
                busy={busy}
                onLog={onLog}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
