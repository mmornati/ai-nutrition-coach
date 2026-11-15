import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  copyDrafts,
  instantForSlot,
  isSameLocalDay,
  mealSlotForHour,
  type MealSlot,
  startOfLocalDay,
  type FoodEntryDraft,
  type PlateLog,
  type QuantityRange,
} from '@anc/core';
import { EMPTY_CUSTOM_FOOD, foodName, parseCustomFood, type CustomFoodInput } from '../../catalog';
import { Button } from '../../components/primitives';
import { QuantityPicker, Sheet } from '../../components/sheets';
import { uniqueQuantities } from '../../components/sheets/foods';
import {
  energyOf,
  entryQuantityText,
  formatNutrient,
  useShowNumbers,
} from '../../components/nutrition';
import { fill, useLocale, useMessage, useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { FoodPicker } from '../log/FoodPicker';
import { NutritionFields } from '../log/CustomFoodForm';
import { DaySlotFields, useDaySlot } from './DaySlotFields';

/** A food's stored per-100 g values as the form's text fields. */
function inputFor(draft: FoodEntryDraft): CustomFoodInput {
  const per100 = draft.databaseFood.nutrientsPer100g;
  const values: Partial<Record<keyof NonNullable<typeof per100>, string>> = {};
  if (per100 !== undefined) {
    for (const [key, value] of Object.entries(per100)) {
      values[key as keyof typeof values] = String(value);
    }
  }
  return {
    ...EMPTY_CUSTOM_FOOD,
    name: draft.databaseFood.displayName,
    grams: draft.quantity.grams === undefined ? '' : String(draft.quantity.grams),
    values,
  };
}

function EditRow({
  id,
  draft,
  defaultOpen,
  onChange,
  onRemove,
  onValidityChange,
}: {
  /** The row's stable id: what the parent keys its state and focus by (never the index). */
  readonly id: number;
  readonly draft: FoodEntryDraft;
  readonly defaultOpen: boolean;
  readonly onChange: (draft: FoodEntryDraft) => void;
  readonly onRemove: () => void;
  readonly onValidityChange: (valid: boolean) => void;
}) {
  const s = useStrings();
  const t = s.relog;
  const p = s.plate;
  const { locale } = useLocale();
  const { catalog } = useSession();
  const showNumbers = useShowNumbers();
  const [open, setOpen] = useState(defaultOpen);
  const [presets, setPresets] = useState<readonly QuantityRange[]>([draft.quantity]);
  // Decided once: typing values into the form gives the draft nutrition, and the form must not
  // swap itself for the amount picker under the person's fingers.
  const [needsNutrition] = useState(() => draft.databaseFood.nutrientsPer100g === undefined);
  const [base] = useState(draft);
  const [form, setForm] = useState<CustomFoodInput>(() => inputFor(draft));
  const name = foodName(draft.databaseFood, locale);
  const energy = energyOf(draft.databaseFood, draft.quantity.grams);
  const parsed = useMemo(() => parseCustomFood(form), [form]);

  // The food's own portions, when the catalogue still knows it: the amount can be changed by
  // preset as well as by weight. Not found (a custom food, an old barcode) is just the weight.
  const ref = draft.databaseFood.sourceRef;
  const foodSource = draft.databaseFood.source;
  const displayName = draft.databaseFood.displayName;
  useEffect(() => {
    if (!open || needsNutrition) return;
    let current = true;
    void catalog
      .search(displayName)
      .then((result) => {
        if (!current || result.kind !== 'rankedMatches') return;
        const match = result.matches.find(
          (m) => m.food.sourceRef === ref && m.food.source === foodSource,
        );
        if (match) setPresets((now) => uniqueQuantities(now, match.presets));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [open, needsNutrition, catalog, ref, foodSource, displayName]);

  // Valid values reach the draft as they are typed (the same way a typed weight does), so "Save
  // changes" can never drop them. Text that is not valid yet holds Save back, with its reason.
  const changeForm = (next: CustomFoodInput) => {
    setForm(next);
    const result = parseCustomFood(next);
    if (result.kind !== 'ok') {
      onValidityChange(false);
      return;
    }
    onValidityChange(true);
    const empty =
      next.grams.trim() === '' && Object.values(next.values).every((v) => (v ?? '').trim() === '');
    if (empty) {
      onChange(base);
      return;
    }
    const nutrients = result.draft.databaseFood.nutrientsPer100g;
    onChange({
      databaseFood: {
        ...base.databaseFood,
        ...(nutrients ? { nutrientsPer100g: nutrients } : {}),
      },
      quantity: result.draft.quantity,
    });
  };
  // The row goes away: it can no longer be invalid.
  const reportValidity = useRef(onValidityChange);
  useEffect(() => {
    reportValidity.current = onValidityChange;
  });
  useEffect(() => () => reportValidity.current(true), []);

  return (
    <li data-row={id} className="border-seam border-b py-2">
      <div className="flex items-stretch justify-between gap-2">
        <span className="min-w-0 py-1">
          <span className="block text-lead">{name}</span>
          <span className="text-body-small text-ink-soft block">
            {entryQuantityText(draft.quantity, locale)}
            {showNumbers && energy !== undefined
              ? ` · ${formatNutrient('energyKcal', energy, false, locale)}`
              : ''}
          </span>
          {showNumbers && energy === undefined && (
            <span className="text-body-small text-ink-soft block">{s.catalog.itemNotCounted}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            data-amount
            aria-expanded={open}
            aria-label={fill(t.changeAmountOf, { name })}
            onClick={() => setOpen((v) => !v)}
            className="text-body-small text-ink-soft min-h-12 min-w-12 cursor-pointer bg-transparent px-2 underline underline-offset-4"
          >
            {t.changeAmount}
          </button>
          <button
            type="button"
            aria-label={fill(p.editRemove, { name })}
            onClick={onRemove}
            className="text-body-small text-ink-soft min-h-12 min-w-12 cursor-pointer bg-transparent px-2 underline underline-offset-4"
          >
            {s.common.remove}
          </button>
        </span>
      </div>
      {open && (
        <div className="pt-2 pb-1">
          {needsNutrition ? (
            <div className="flex flex-col gap-3">
              <NutritionFields
                value={form}
                onChange={changeForm}
                issue={parsed.kind === 'invalid' ? parsed.issue : null}
              />
            </div>
          ) : (
            <QuantityPicker
              presets={uniqueQuantities([draft.quantity], presets)}
              value={draft.quantity}
              food={draft.databaseFood}
              onChange={(quantity) => onChange({ ...draft, quantity })}
              onValidityChange={onValidityChange}
            />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Edit a logged plate: change an amount (preset or weight), complete a food that has no weight or
 * nutrition, remove a food, add one (the Type it search), and move the plate to another meal or
 * day. Nothing is written until "Save changes"; saving swaps the plate for the edited one in one
 * step (see `EncryptedStore.replacePlate`) and rewrites its coach note.
 */
export function EditPlateSheet({
  open,
  plate,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly plate: PlateLog;
  readonly onClose: () => void;
  /** Resolves true when the edited plate was stored. */
  readonly onSave: (
    drafts: readonly FoodEntryDraft[],
    loggedAtUtc: number,
    slot: MealSlot | null,
  ) => Promise<boolean>;
}) {
  const all = useStrings();
  const p = all.plate;
  const { clock } = useSession();
  const originalSlot: MealSlot =
    plate.slot ?? mealSlotForHour(new Date(plate.loggedAtUtc).getHours());
  const plateDay = startOfLocalDay(plate.loggedAtUtc);
  // Each food on the sheet carries a local id, so removing one does not shift the rows' own state.
  const nextId = useRef(plate.entries.length);
  const [items, setItems] = useState<
    readonly { readonly id: number; readonly draft: FoodEntryDraft }[]
  >(() => copyDrafts(plate.entries).map((draft, id) => ({ id, draft })));
  const drafts = items.map((i) => i.draft);
  // Rows holding text that is not valid yet, by row id.
  const [invalid, setInvalid] = useState<ReadonlySet<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<FoodEntryDraft | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useMessage();
  const statusId = useId();
  const choice = useDaySlot({ day: plateDay, slot: originalSlot, keep: originalSlot });
  const rootRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // Where focus goes once the next render has put the new rows in place: a removed or added row
  // would otherwise drop it to the page behind the sheet.
  const pendingFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });
  const focusRow = (rowId: number) => () =>
    rootRef.current?.querySelector<HTMLElement>(`[data-row="${rowId}"] [data-amount]`)?.focus();
  const focusFallback = () =>
    (addRef.current ?? rootRef.current?.querySelector<HTMLElement>('input'))?.focus();

  const setRowValid = (rowId: number, valid: boolean) =>
    setInvalid((set) => {
      if (valid === !set.has(rowId)) return set;
      const next = new Set(set);
      if (valid) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

  const removeRow = (rowId: number) => {
    const index = items.findIndex((it) => it.id === rowId);
    const neighbour = items[index + 1] ?? items[index - 1];
    pendingFocus.current = neighbour === undefined ? focusFallback : focusRow(neighbour.id);
    setItems((list) => list.filter((it) => it.id !== rowId));
    setRowValid(rowId, true);
  };

  const save = async () => {
    if (busy || invalid.size > 0) return;
    if (drafts.length === 0) {
      setNote((a) => a.plate.editEmpty);
      return;
    }
    setBusy(true);
    const now = clock();
    const unchanged = isSameLocalDay(choice.day, plateDay) && choice.slot === originalSlot;
    // Never later than the clock: a meal moved to today lands at its hour or now, not after.
    const at = unchanged
      ? plate.loggedAtUtc
      : Math.min(instantForSlot({ day: choice.day, slot: choice.slot, now }), now);
    let saved: boolean;
    try {
      // Unchanged day and meal: the plate keeps what it had (a chosen meal, or none). Moved: the
      // meal now chosen is kept.
      saved = await onSave(drafts, at, unchanged ? (plate.slot ?? null) : choice.slot);
    } catch {
      saved = false;
    }
    setBusy(false);
    if (!saved) setNote((a) => a.plate.editFailed);
  };

  return (
    <Sheet open={open} onClose={onClose} title={p.editTitle}>
      <div ref={rootRef} className="flex flex-col gap-4">
        <p className="text-body-small text-ink-soft">{p.editIntro}</p>
        <ul aria-label={all.entries.label} className="border-ink border-t-2">
          {items.map(({ id, draft }) => (
            <EditRow
              key={id}
              id={id}
              draft={draft}
              defaultOpen={
                draft.quantity.grams === undefined ||
                draft.databaseFood.nutrientsPer100g === undefined
              }
              onChange={(next) =>
                setItems((list) => list.map((it) => (it.id === id ? { id, draft: next } : it)))
              }
              onRemove={() => removeRow(id)}
              onValidityChange={(valid) => setRowValid(id, valid)}
            />
          ))}
        </ul>
        {adding ? (
          <div className="flex flex-col gap-3">
            <FoodPicker resetKey={resetKey} onDraftChange={setPick} focusOnMount />
            <Button
              variant="secondary"
              fullWidth
              disabled={pick === null}
              onClick={() => {
                if (pick === null) return;
                const rowId = nextId.current++;
                pendingFocus.current = focusRow(rowId);
                setItems((list) => [...list, { id: rowId, draft: pick }]);
                setResetKey((k) => k + 1);
                setAdding(false);
              }}
            >
              {p.editAddConfirm}
            </Button>
          </div>
        ) : (
          <button
            ref={addRef}
            type="button"
            onClick={() => setAdding(true)}
            className="text-ink-soft inline-flex min-h-12 w-fit cursor-pointer items-center bg-transparent text-lead underline underline-offset-4"
          >
            {p.editAddFood}
          </button>
        )}
        <DaySlotFields choice={choice} />
        {/* Always mounted: a live region is announced reliably only when its text changes. */}
        <p id={statusId} role="status" className="text-body-small text-ink-soft empty:hidden">
          {invalid.size > 0 ? p.editInvalid : note}
        </p>
        <Button
          fullWidth
          aria-disabled={invalid.size > 0 ? true : undefined}
          aria-describedby={invalid.size > 0 ? statusId : undefined}
          busy={busy}
          busyLabel={all.common.logging}
          onClick={() => void save()}
        >
          {p.editSave}
        </Button>
      </div>
    </Sheet>
  );
}
