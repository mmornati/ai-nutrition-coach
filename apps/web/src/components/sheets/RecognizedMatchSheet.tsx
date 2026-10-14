import { useMemo, useRef, useState } from 'react';
import type {
  DatabaseFood,
  FoodEntryDraft,
  FoodMatch,
  QuantityRange,
  RecognitionResult,
} from '@anc/core';
import { plural, useStrings, type Strings } from '../../i18n';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { GroupMarker } from '../primitives/GroupMarker';
import { TextField } from '../primitives/TextField';
import { effectivePresets, manualFood, ONE_SERVING, sameFood, uniqueQuantities } from './foods';
import { PortionPresets } from './PortionPresets';
import { Sheet } from './Sheet';

export interface RecognizedMatchSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly result: RecognitionResult;
  /** Catalog matches for what was seen (or for the no-AI fallback). */
  readonly closestMatches: readonly FoodMatch[];
  /**
   * Commit the chosen foods as ONE plate. While the returned promise is pending every Log button
   * is disabled. Reject (or throw) to keep the sheet as it is.
   */
  readonly onLog: (drafts: readonly FoodEntryDraft[]) => void | Promise<void>;
  readonly errorMessage?: string | undefined;
}

interface Candidate {
  readonly key: string;
  readonly food: DatabaseFood;
  readonly presets: readonly QuantityRange[];
  readonly confidence?: number;
}

/** Calm words for how sure the recognition was. Never a number. */
const LIKELY_AT = 0.75;

interface Choice {
  readonly checked: boolean;
  readonly quantity: QuantityRange;
}

function describe(
  result: RecognitionResult,
  s: Strings,
): { title: string; subtitle: string | undefined } {
  const r = s.recognized;
  switch (result.kind) {
    case 'recognizedPlate':
      if (result.foods.length === 0) return { title: r.nothingMatched, subtitle: r.pickOrType };
      return {
        title: plural(r.lookedLike, result.foods.length),
        subtitle: r.tickHint,
      };
    case 'noMatch':
      return { title: r.nothingOnPlate, subtitle: r.pickOrType };
    case 'quotaExhausted':
      return { title: r.quotaTitle, subtitle: r.quotaHint };
    case 'recognitionFailure':
      return { title: r.failureTitle, subtitle: undefined };
  }
}

/** Stable identity of a food across re-renders (and late-arriving results). */
const foodKey = (f: DatabaseFood): string => `${f.source}:${f.sourceRef}`;

/** Recognised foods first (all ticked), then catalog matches that are not already listed. */
function buildCandidates(
  result: RecognitionResult,
  closest: readonly FoodMatch[],
): { recognized: Candidate[]; extra: Candidate[] } {
  const recognizedFoods = result.kind === 'recognizedPlate' ? result.foods : [];
  const seen = new Set<string>();
  const unique = (key: string): string => {
    let k = key;
    for (let n = 2; seen.has(k); n++) k = `${key}#${n}`;
    seen.add(k);
    return k;
  };
  const recognized = recognizedFoods.map((rec): Candidate => {
    const catalog = closest.find((m) => sameFood(m.food, rec.databaseFood));
    return {
      key: unique(foodKey(rec.databaseFood)),
      food: rec.databaseFood,
      presets: uniqueQuantities([rec.quantity], catalog?.presets ?? []),
      confidence: rec.confidence,
    };
  });
  const extra = closest
    .filter((m) => !recognizedFoods.some((rec) => sameFood(rec.databaseFood, m.food)))
    .map((m): Candidate => ({
      key: unique(foodKey(m.food)),
      food: m.food,
      presets: effectivePresets(m.presets),
    }));
  return { recognized, extra };
}

/** Defaults for a candidate seen for the first time after the sheet opened: never pre-ticked. */
const lateChoice = (c: Candidate): Choice => ({
  checked: false,
  quantity: c.presets[0] ?? ONE_SERVING,
});

function initialChoices(recognized: readonly Candidate[], extra: readonly Candidate[]) {
  const choices: Record<string, Choice> = {};
  for (const c of recognized)
    choices[c.key] = { checked: true, quantity: c.presets[0] ?? ONE_SERVING };
  // With nothing recognised, the first catalog match is pre-ticked (same as the Flutter sheet).
  extra.forEach((c, i) => {
    choices[c.key] = {
      checked: recognized.length === 0 && i === 0,
      quantity: c.presets[0] ?? ONE_SERVING,
    };
  });
  return choices;
}

function Body({
  result,
  closestMatches,
  onLog,
  errorMessage,
}: Omit<RecognizedMatchSheetProps, 'open' | 'onClose'>) {
  const s = useStrings();
  const r = s.recognized;
  // Derived, so a result or catalog matches that arrive after the sheet opened are picked up.
  const { recognized, extra } = useMemo(
    () => buildCandidates(result, closestMatches),
    [result, closestMatches],
  );
  const [choices, setChoices] = useState(() => initialChoices(recognized, extra));
  const [customName, setCustomName] = useState('');
  const [customMessage, setCustomMessage] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState<'ticked' | 'custom' | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const all = [...recognized, ...extra];

  // Reconcile by food: keep what the person ticked or changed, add new candidates unticked.
  const newcomers = all.filter((c) => !(c.key in choices));
  if (newcomers.length > 0) {
    setChoices((prev) => ({
      ...Object.fromEntries(newcomers.map((c) => [c.key, lateChoice(c)])),
      ...prev,
    }));
  }
  const ticked = all.filter((c) => choices[c.key]?.checked);

  const update = (key: string, patch: Partial<Choice>) =>
    setChoices((prev) => {
      const current = prev[key];
      return current ? { ...prev, [key]: { ...current, ...patch } } : prev;
    });

  const commit = async (
    which: 'ticked' | 'custom',
    drafts: readonly FoodEntryDraft[],
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSubmitting(which);
    setFailed(false);
    try {
      await onLog(drafts);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      inFlight.current = false;
      setSubmitting(null);
    }
  };

  const logTicked = () =>
    commit(
      'ticked',
      ticked.map((c) => ({
        databaseFood: c.food,
        quantity: choices[c.key]?.quantity ?? ONE_SERVING,
      })),
    );

  const logCustom = async () => {
    const name = customName.trim();
    if (name === '') {
      setCustomMessage(r.typeNameFirst);
      return;
    }
    setCustomMessage(undefined);
    if (await commit('custom', [{ databaseFood: manualFood(name), quantity: ONE_SERVING }]))
      setCustomName('');
  };

  const row = (c: Candidate) => {
    const choice = choices[c.key];
    if (!choice) return null;
    return (
      <li key={c.key} className="border-rule border-b">
        <Checkbox
          checked={choice.checked}
          onChange={(e) => update(c.key, { checked: e.target.checked })}
        >
          <span className="block text-lead">{c.food.displayName}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <GroupMarker group={c.food.foodGroup} />
            {c.confidence !== undefined && (
              <span className="text-body-small text-signal-muted">
                {c.confidence >= LIKELY_AT ? r.confidenceLikely : r.confidenceMaybe}
              </span>
            )}
          </span>
        </Checkbox>
        {choice.checked && (
          <div className="pr-0 pb-3 pl-9">
            <PortionPresets
              presets={c.presets}
              value={choice.quantity}
              onChange={(quantity) => update(c.key, { quantity })}
              label={`${s.portion.label}: ${c.food.displayName}`}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      {recognized.length > 0 && (
        <ul aria-label={r.recognizedLabel} className="border-porcelain border-t-2">
          {recognized.map(row)}
        </ul>
      )}
      {extra.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="font-display text-section text-signal-muted uppercase">
            {r.closestMatches}
          </h3>
          <ul className="border-porcelain border-t-2">{extra.map(row)}</ul>
        </section>
      )}
      {(errorMessage ?? (failed ? s.common.logFailed : undefined)) && (
        <p role="status" className="text-body-small text-porcelain-dim">
          {errorMessage ?? s.common.logFailed}
        </p>
      )}
      <Button
        fullWidth
        disabled={ticked.length === 0}
        busy={submitting === 'ticked'}
        aria-disabled={submitting === 'custom' ? true : undefined}
        busyLabel={s.common.logging}
        onClick={() => void logTicked()}
      >
        {s.common.log}
      </Button>
      <div className="flex flex-col gap-2">
        <TextField
          label={r.customFoodName}
          value={customName}
          message={customMessage}
          onChange={(e) => {
            setCustomName(e.target.value);
            setCustomMessage(undefined);
          }}
        />
        <Button
          variant="outline-porcelain"
          fullWidth
          busy={submitting === 'custom'}
          aria-disabled={submitting === 'ticked' ? true : undefined}
          busyLabel={s.common.logging}
          onClick={() => void logCustom()}
        >
          {r.logCustomFood}
        </Button>
      </div>
    </>
  );
}

/**
 * The photo (or no-AI) result: what was recognised, the closest catalog matches and a custom
 * food field.
 *
 * Design decision (the Flutter sheet logged one food per plate, a known gap): every recognised
 * food is a tick box, all ticked by default, and `Log` records all ticked foods as ONE plate with
 * one portion each. Closest matches are extra, unticked rows (the first one is pre-ticked only
 * when nothing was recognised). `Log custom food` stays a separate one-food action.
 */
export function RecognizedMatchSheet({
  open,
  onClose,
  result,
  closestMatches,
  onLog,
  errorMessage,
}: RecognizedMatchSheetProps) {
  const s = useStrings();
  const { title, subtitle } = describe(result, s);
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle} focusTitle>
      <Body
        result={result}
        closestMatches={closestMatches}
        onLog={onLog}
        errorMessage={errorMessage}
      />
    </Sheet>
  );
}
