import { useState } from 'react';
import { copyDrafts, type FoodEntryDraft, type QuantityRange } from '@anc/core';
import { foodName } from '../../catalog';
import { entryQuantityText } from '../../components/nutrition';
import { Button, GroupMarker } from '../../components/primitives';
import { QuantityPicker } from '../../components/sheets';
import { fill, useLocale, useStrings } from '../../i18n';

/**
 * The foods of a saved meal, each with its saved amount. "Change" opens that food's picker (the
 * saved amount and the Grams field); logging makes a new plate from whatever the amounts are now.
 */
export function MealEditor({
  entries,
  busy,
  onLog,
}: {
  readonly entries: readonly FoodEntryDraft[];
  readonly busy: boolean;
  readonly onLog: (drafts: readonly FoodEntryDraft[]) => void;
}) {
  const s = useStrings();
  const t = s.relog;
  const { locale } = useLocale();
  const [drafts, setDrafts] = useState<readonly FoodEntryDraft[]>(() => copyDrafts(entries));
  const [open, setOpen] = useState<number | null>(null);
  // Entries whose Grams field holds text that is not a weight: Log stays off until it is fixed.
  const [invalid, setInvalid] = useState<ReadonlySet<number>>(new Set());

  const setQuantity = (index: number, quantity: QuantityRange) =>
    setDrafts((all) => all.map((d, i) => (i === index ? { ...d, quantity } : d)));
  const setValid = (index: number, valid: boolean) =>
    setInvalid((all) => {
      if (all.has(index) === !valid) return all;
      const next = new Set(all);
      if (valid) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-small text-ink-soft">{t.logMealIntro}</p>
      <ul aria-label={s.entries.label} className="border-ink border-t-2">
        {drafts.map((draft, i) => {
          const name = foodName(draft.databaseFood, locale);
          const editing = open === i;
          return (
            <li key={`${draft.databaseFood.sourceRef}:${i}`} className="border-seam border-b py-3">
              <div className="flex items-baseline justify-between gap-3 text-lead">
                <span className="min-w-0">{name}</span>
                <span className="font-display quantity text-quantity font-semibold whitespace-nowrap">
                  {entryQuantityText(draft.quantity, locale)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <GroupMarker group={draft.databaseFood.foodGroup} />
                <button
                  type="button"
                  aria-expanded={editing}
                  aria-label={fill(t.changeAmountOf, { name })}
                  onClick={() => setOpen(editing ? null : i)}
                  className="text-body-small text-ink-soft min-h-12 min-w-14 cursor-pointer bg-transparent px-2 underline underline-offset-4"
                >
                  {t.changeAmount}
                </button>
              </div>
              {editing && (
                <div className="mt-2">
                  <QuantityPicker
                    key={i}
                    food={draft.databaseFood}
                    presets={[entries[i]?.quantity ?? draft.quantity]}
                    value={draft.quantity}
                    onChange={(quantity) => setQuantity(i, quantity)}
                    onValidityChange={(valid) => setValid(i, valid)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        fullWidth
        disabled={invalid.size > 0}
        busy={busy}
        busyLabel={s.common.logging}
        onClick={() => onLog(drafts)}
      >
        {t.logMeal}
      </Button>
    </div>
  );
}
