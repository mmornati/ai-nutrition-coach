import { useEffect, useRef, useState } from 'react';
import {
  isPartial,
  sumNutrients,
  type FoodEntry,
  type FoodEntryDraft,
  type FoodUse,
  type RecordPlateResult,
} from '@anc/core';
import { fill, useLocale, useMessage, useStrings } from '../../i18n';
import { Button } from '../../components/primitives';
import { Sheet, SheetFooter } from '../../components/sheets';
import {
  entryQuantityText,
  formatNutrient,
  energyOf,
  useShowNumbers,
} from '../../components/nutrition';
import { foodName } from '../../catalog';
import { useRecordHere } from '../../app/log-context';
import { FoodPicker } from './FoodPicker';
import { RecentFoods } from './RecentFoods';

/** A draft as an entry, so the totals model can sum a plate that is not stored yet. */
const asEntry = (draft: FoodEntryDraft, id: number): FoodEntry => ({
  id,
  plateLogId: 0,
  databaseFood: draft.databaseFood,
  quantity: draft.quantity,
});

/**
 * "On this plate": the foods put on the plate so far, each with its amount and (numbers on) its
 * energy, the plate total, and a remove button per food. Totals say "at least" while a food has
 * no weight or no energy; that food is marked "not counted".
 */
export function PlateDraftList({
  items,
  onRemove,
  onEmptied,
}: {
  readonly items: readonly FoodEntryDraft[];
  readonly onRemove: (index: number) => void;
  /** The last food was removed and the list is gone: the caller puts focus somewhere sensible. */
  readonly onEmptied?: (() => void) | undefined;
}) {
  const s = useStrings();
  const c = s.catalog;
  const { locale } = useLocale();
  const showNumbers = useShowNumbers();
  const listRef = useRef<HTMLUListElement>(null);
  // After a removal focus moves to the Remove button now at the same place (the next food, or
  // the previous one when the last was removed), not to the page behind.
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    const index = focusIndex.current;
    focusIndex.current = null;
    if (index === null) return;
    const buttons = listRef.current?.querySelectorAll<HTMLElement>('[data-remove]');
    buttons?.[Math.min(index, buttons.length - 1)]?.focus();
  });
  if (items.length === 0) return null;
  const total = sumNutrients(items.map(asEntry));
  const kcal = total.totals.energyKcal;
  return (
    <section aria-label={c.onPlate} className="flex flex-col gap-1">
      <h3 className="font-display text-section text-thread">{c.onPlate}</h3>
      <ul ref={listRef} className="border-ink border-t-2">
        {items.map((item, index) => {
          const name = foodName(item.databaseFood, locale);
          const energy = energyOf(item.databaseFood, item.quantity.grams);
          return (
            <li
              // A draft has no id; the list is only ever appended to or removed from by index.
              key={`${index}:${item.databaseFood.sourceRef}`}
              className="border-seam flex items-stretch justify-between gap-3 border-b"
            >
              <span className="min-w-0 py-2.5">
                <span className="block text-lead">{name}</span>
                <span className="text-body-small text-ink-soft block">
                  {entryQuantityText(item.quantity, locale)}
                  {showNumbers && energy !== undefined
                    ? ` · ${formatNutrient('energyKcal', energy, false, locale)}`
                    : ''}
                </span>
                {showNumbers && energy === undefined && (
                  <span className="text-body-small text-ink-soft block">{c.itemNotCounted}</span>
                )}
              </span>
              <button
                type="button"
                aria-label={fill(c.removeItem, { name })}
                data-remove
                onClick={() => {
                  focusIndex.current = index;
                  onRemove(index);
                  if (items.length === 1) onEmptied?.();
                }}
                className="text-body-small text-ink-soft min-h-12 min-w-12 shrink-0 cursor-pointer bg-transparent px-2 underline underline-offset-4"
              >
                {s.common.remove}
              </button>
            </li>
          );
        })}
      </ul>
      {showNumbers && kcal !== undefined && (
        <p className="font-display quantity text-lead pt-1 font-semibold">
          {c.plateTotal}
          {': '}
          {formatNutrient(
            'energyKcal',
            kcal,
            total.estimated,
            locale,
            isPartial(total, 'energyKcal'),
          )}
        </p>
      )}
    </section>
  );
}

/**
 * Type it: build a plate. Search a food, set its amount, then "Log" (one food, one extra tap at
 * most) or "Add another food" and repeat; the foods so far are listed with their energy and a
 * plate total, and can be removed before logging. A name that matches nothing opens the custom
 * food form (with optional weight and nutrition so it counts). A scanned barcode the catalog did
 * not know arrives prefilled; a barcode food added to the plate arrives in `initialItems`.
 */
export function TypeIt({
  prefill,
  initialItems,
  onLogged,
}: {
  readonly prefill?: string | undefined;
  readonly initialItems?: readonly FoodEntryDraft[] | undefined;
  readonly onLogged: () => void;
}) {
  const s = useStrings();
  const c = s.catalog;
  const record = useRecordHere();
  const [items, setItems] = useState<readonly FoodEntryDraft[]>(initialItems ?? []);
  const [draft, setDraft] = useState<FoodEntryDraft | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [idle, setIdle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useMessage();
  const rootRef = useRef<HTMLDivElement>(null);

  const log = async (drafts: readonly FoodEntryDraft[]) => {
    if (busy || drafts.length === 0) return;
    setBusy(true);
    let result: RecordPlateResult | null;
    try {
      result = await record(drafts);
    } catch {
      result = null;
    }
    setBusy(false);
    if (result?.kind === 'recordPlateSuccess') {
      setNote(null);
      onLogged();
    } else {
      setNote((a) => a.common.logFailed);
    }
  };

  const addAnother = () => {
    if (draft === null) return;
    setItems((list) => [...list, draft]);
    setNote(null);
    setResetKey((k) => k + 1);
  };

  const withDraft = draft === null ? items : [...items, draft];
  const canLog = withDraft.length > 0;

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <PlateDraftList
        items={items}
        onRemove={(index) => setItems((list) => list.filter((_, i) => i !== index))}
        onEmptied={() => rootRef.current?.querySelector<HTMLElement>('input')?.focus()}
      />
      <FoodPicker
        prefill={prefill}
        resetKey={resetKey}
        onDraftChange={setDraft}
        onIdleChange={setIdle}
        recents={({ select }) => (
          <RecentFoods
            busy={busy}
            onLog={(use: FoodUse) =>
              void log([...items, { databaseFood: use.food, quantity: use.quantity }])
            }
            onEdit={select}
          />
        )}
      />
      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {note}
      </p>
      {(!idle || items.length > 0) && (
        <SheetFooter>
          <Button
            fullWidth
            disabled={!canLog}
            busy={busy}
            busyLabel={s.common.logging}
            onClick={() => void log(withDraft)}
          >
            {items.length > 0 ? c.logPlate : s.common.log}
          </Button>
          <Button variant="secondary" fullWidth disabled={draft === null} onClick={addAnother}>
            {c.addAnother}
          </Button>
        </SheetFooter>
      )}
    </div>
  );
}

/** The Type it sheet: a bottom sheet on a phone, a centred dialog on desktop. */
export function TypeItSheet({
  open,
  prefill,
  initialItems,
  onClose,
  onLogged,
}: {
  readonly open: boolean;
  readonly prefill?: string | undefined;
  readonly initialItems?: readonly FoodEntryDraft[] | undefined;
  readonly onClose: () => void;
  readonly onLogged: () => void;
}) {
  const s = useStrings().catalog;
  return (
    <Sheet open={open} onClose={onClose} title={s.title}>
      <TypeIt prefill={prefill} initialItems={initialItems} onLogged={onLogged} />
    </Sheet>
  );
}
