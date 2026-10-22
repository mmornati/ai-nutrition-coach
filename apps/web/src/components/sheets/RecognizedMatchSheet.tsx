import { useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  DatabaseFood,
  FoodEntryDraft,
  FoodMatch,
  QuantityRange,
  RecognitionResult,
} from '@anc/core';
import { foodName } from '../../catalog';
import { plural, useLocale, useMessage, useStrings, type Strings } from '../../i18n';
import { portionFor } from '../../i18n/sentences';
import { Button } from '../primitives/Button';
import { AiSetupLink } from './AiSetupLink';
import { Checkbox } from '../primitives/Checkbox';
import { GroupMarker } from '../primitives/GroupMarker';
import { TextField } from '../primitives/TextField';
import { effectivePresets, manualFood, oneServing, sameFood, uniqueQuantities } from './foods';
import { QuantityPicker } from './QuantityPicker';
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
  /** In-app route to Settings → Your AI. When given, results that need AI set up link to it. */
  readonly aiSetupHref?: string | undefined;
  /** This server offers AI the person has not turned on: the no-AI hint points at it. */
  readonly instanceOffered?: boolean | undefined;
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

/** Failures the person can fix in Settings → Your AI. */
const NEEDS_SETUP = new Set<string>([
  'noAi',
  'notConfigured',
  'keyMissing',
  'keyRejected',
  'consentRequired',
]);

/** The ai layer words failures as short lower-case lines; as a subtitle they start a sentence. */
const sentence = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

function describe(
  result: RecognitionResult,
  s: Strings,
  errorMessage: string | undefined,
  instanceOffered = false,
): { title: string; subtitle: string | undefined; needsSetup: boolean } {
  const r = s.recognized;
  switch (result.kind) {
    case 'recognizedPlate':
      if (result.foods.length === 0) {
        return { title: r.nothingMatched, subtitle: r.pickOrType, needsSetup: false };
      }
      return {
        title: plural(r.lookedLike, result.foods.length),
        subtitle: r.tickHint,
        needsSetup: false,
      };
    case 'noMatch':
      return { title: r.nothingOnPlate, subtitle: r.pickOrType, needsSetup: false };
    case 'quotaExhausted':
      return { title: r.quotaTitle, subtitle: r.quotaHint, needsSetup: false };
    case 'recognitionFailure': {
      if (result.cause === 'noAi') {
        return {
          title: r.noAiTitle,
          subtitle: instanceOffered ? r.noAiHintInstance : r.noAiHint,
          needsSetup: true,
        };
      }
      const detail = errorMessage ?? result.message;
      return {
        title: r.failureTitle,
        subtitle: detail === undefined || detail === '' ? undefined : sentence(detail),
        needsSetup: NEEDS_SETUP.has(result.cause),
      };
    }
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
  quantity: c.presets[0] ?? oneServing(),
});

function initialChoices(recognized: readonly Candidate[], extra: readonly Candidate[]) {
  const choices: Record<string, Choice> = {};
  for (const c of recognized)
    choices[c.key] = { checked: true, quantity: c.presets[0] ?? oneServing() };
  // With nothing recognised, the first catalog match is pre-ticked (same as the earlier sheet).
  extra.forEach((c, i) => {
    choices[c.key] = {
      checked: recognized.length === 0 && i === 0,
      quantity: c.presets[0] ?? oneServing(),
    };
  });
  return choices;
}

function Body({
  result,
  closestMatches,
  onLog,
  errorMessage,
  setupLink,
}: Omit<RecognizedMatchSheetProps, 'open' | 'onClose' | 'aiSetupHref' | 'instanceOffered'> & {
  readonly setupLink: ReactNode;
}) {
  const s = useStrings();
  const { locale } = useLocale();
  const r = s.recognized;
  // Derived, so a result or catalog matches that arrive after the sheet opened are picked up.
  const { recognized, extra } = useMemo(
    () => buildCandidates(result, closestMatches),
    [result, closestMatches],
  );
  const [choices, setChoices] = useState(() => initialChoices(recognized, extra));
  const [customName, setCustomName] = useState('');
  const [customMessage, setCustomMessage] = useMessage();
  const [submitting, setSubmitting] = useState<'ticked' | 'custom' | null>(null);
  const [failed, setFailed] = useState(false);
  // Candidates whose Grams field holds text that is not a weight: Log stays off while any is ticked.
  const [badWeight, setBadWeight] = useState<ReadonlySet<string>>(new Set());
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
  const weightsValid = !ticked.some((c) => badWeight.has(c.key));

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
        quantity: choices[c.key]?.quantity ?? oneServing(),
      })),
    );

  const logCustom = async () => {
    const name = customName.trim();
    if (name === '') {
      setCustomMessage((a) => a.recognized.typeNameFirst);
      return;
    }
    setCustomMessage(null);
    if (await commit('custom', [{ databaseFood: manualFood(name), quantity: oneServing() }]))
      setCustomName('');
  };

  const row = (c: Candidate) => {
    const choice = choices[c.key];
    if (!choice) return null;
    return (
      <li key={c.key} className="border-seam border-b">
        <Checkbox
          checked={choice.checked}
          onChange={(e) => update(c.key, { checked: e.target.checked })}
        >
          <span className="block text-lead">{foodName(c.food, locale)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <GroupMarker group={c.food.foodGroup} />
            {c.confidence !== undefined && (
              <span className="text-body-small text-thread">
                {c.confidence >= LIKELY_AT ? r.confidenceLikely : r.confidenceMaybe}
              </span>
            )}
          </span>
        </Checkbox>
        {choice.checked && (
          <div className="pr-0 pb-3 pl-9">
            <QuantityPicker
              food={c.food}
              presets={c.presets}
              value={choice.quantity}
              onChange={(quantity) => update(c.key, { quantity })}
              onValidityChange={(valid) =>
                setBadWeight((prev) => {
                  if (prev.has(c.key) === !valid) return prev;
                  const next = new Set(prev);
                  if (valid) next.delete(c.key);
                  else next.add(c.key);
                  return next;
                })
              }
              label={portionFor(foodName(c.food, locale))}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      {setupLink}
      {recognized.length > 0 && (
        <ul aria-label={r.recognizedLabel} className="border-ink border-t-2">
          {recognized.map(row)}
        </ul>
      )}
      {extra.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="font-display text-section text-thread">{r.closestMatches}</h3>
          <ul className="border-ink border-t-2">{extra.map(row)}</ul>
        </section>
      )}
      {/* Always mounted: a live region is only announced reliably when its text changes. */}
      <p role="status" className="text-body-small text-ink-soft empty:-mt-4">
        {errorMessage ?? (failed ? s.common.logFailed : undefined)}
      </p>
      <Button
        fullWidth
        disabled={ticked.length === 0 || !weightsValid}
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
          message={customMessage ?? undefined}
          onChange={(e) => {
            setCustomName(e.target.value);
            setCustomMessage(null);
          }}
        />
        <Button
          variant="secondary"
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
 * Design decision (the earlier sheet logged one food per plate, a known gap): every recognised
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
  aiSetupHref,
  instanceOffered,
}: RecognizedMatchSheetProps) {
  const s = useStrings();
  const { title, subtitle, needsSetup } = describe(result, s, errorMessage, instanceOffered);
  const shownInSubtitle = result.kind === 'recognitionFailure' && result.cause !== 'noAi';
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle} focusTitle>
      <Body
        result={result}
        closestMatches={closestMatches}
        onLog={onLog}
        errorMessage={shownInSubtitle ? undefined : errorMessage}
        setupLink={
          needsSetup && aiSetupHref !== undefined ? (
            <AiSetupLink href={aiSetupHref} onNavigate={onClose} />
          ) : null
        }
      />
    </Sheet>
  );
}
