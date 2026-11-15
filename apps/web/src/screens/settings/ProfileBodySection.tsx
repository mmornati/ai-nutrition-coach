import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from 'react';
import {
  HEIGHT_RANGE_CM,
  localDayText,
  type MeasurementKind,
  type Profile,
  type UnitSystem,
} from '@anc/core';
import { SupportLine, useShowNumbers } from '../../components/nutrition';
import { Button, TextField } from '../../components/primitives';
import { fill, useLocale, useStrings } from '../../i18n';
import type { Locale } from '../../i18n/locale';
import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import {
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  kgToLb,
  MAX_INCHES_PART,
  parseMeasurementText,
  parseTypedNumber,
  splitFeetAndInches,
  weightNeedsConfirmation,
} from './body-input';
import { WeightConfirm } from './WeightConfirm';
import { ChoiceGroup } from './ChoiceGroup';
import { Prose, Section } from './SettingsPage';

const oneDecimal = (locale: Locale) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const asText = (value: number, locale: Locale): string => oneDecimal(locale).format(value);

/** `yyyy-MM-dd` (a local calendar day) in the person's language. */
export function formatDay(day: string, locale: Locale): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1),
  );
}

/**
 * Settings, Profile, "Body": height, the current weight (a dated weigh-in), an optional waist, and
 * the units. Every field is optional. Each number has its own Save button and a calm, specific
 * message; a decimal comma is accepted. Saving a weight writes a dated measurement for today (a
 * second one the same day replaces it). The support line sits next to the weigh-in entry
 * (docs/no-dark-patterns-standard.md).
 */
export function ProfileBodySection({
  profile,
  onProfile,
  compact = false,
  title,
  commitRef,
}: {
  readonly profile: Profile | undefined;
  /** The welcome asks only for what the guide needs: no waist, no list of earlier weigh-ins. */
  readonly compact?: boolean;
  /** Replaces the section title (the welcome has its own heading). */
  readonly title?: string;
  /**
   * The welcome (`compact`) fills this with a function that settles what is typed before the step is
   * left: it saves valid entries and, for one that is not valid, shows the message on the field, moves
   * focus to it and answers `false`, so "Next" does not leave an answer behind.
   */
  readonly commitRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  /** Writes one profile field (or removes it); resolves once the screen state is up to date. */
  readonly onProfile: <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => void;
}) {
  const all = useStrings();
  const s = all.profile;
  const { locale } = useLocale();
  const { profile: pref, clock, live } = useSession();
  const body = useSyncExternalStore(pref.subscribe, pref.measurementList);
  // With nutrition numbers hidden no weight or waist figure is echoed back (entry still works).
  const showNumbers = useShowNumbers();
  const units: UnitSystem = profile?.units ?? 'metric';
  const imperial = units === 'imperial';
  const latestWeight = body.find((m) => m.kind === 'weight');
  const latestWaist = body.find((m) => m.kind === 'waist');
  const weights = body.filter((m) => m.kind === 'weight').slice(0, 5);

  // A field shows what is stored until the person types: a draft (`null` = none) then replaces it,
  // and goes away again once saved. A restore or another device changing the stored value shows
  // at once while nothing is being typed.
  const [heightCmDraft, setHeightCm] = useState<string | null>(null);
  const [heightFtDraft, setHeightFt] = useState<string | null>(null);
  const [heightInDraft, setHeightIn] = useState<string | null>(null);
  const [weightDraft, setWeight] = useState<string | null>(null);
  const [waistDraft, setWaist] = useState<string | null>(null);
  // The typed weight is far from the last one: asked once before it is saved.
  const [confirmingWeight, setConfirmingWeight] = useState(false);
  const cmField = useRef<HTMLInputElement>(null);
  const feetField = useRef<HTMLInputElement>(null);
  const inchesField = useRef<HTMLInputElement>(null);
  const weightField = useRef<HTMLInputElement>(null);
  const storedHeight = profile?.heightCm;
  const storedFeetInches = storedHeight === undefined ? undefined : cmToFeetInches(storedHeight);
  const heightCm =
    heightCmDraft ?? (storedHeight === undefined ? '' : asText(storedHeight, locale));
  const heightFt =
    heightFtDraft ?? (storedFeetInches === undefined ? '' : String(storedFeetInches.feet));
  const heightIn =
    heightInDraft ??
    (storedFeetInches === undefined ? '' : asText(storedFeetInches.inches, locale));
  // The weight and the waist fields start EMPTY: pre-filling the last value would let a tap on Save
  // record a stale figure as today's. The last one is shown as text beside the field.
  const weight = weightDraft ?? '';
  const waist = waistDraft ?? '';
  const dropDrafts = (): void => {
    setHeightCm(null);
    setHeightFt(null);
    setHeightIn(null);
    setWeight(null);
    setWaist(null);
    setConfirmingWeight(false);
  };

  const heightErrorId = useId();
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [status, setStatus] = useState('');
  const fail = (field: string, message: string): void =>
    setErrors((current) => ({ ...current, [field]: message }));
  const ok = (field: string): void =>
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });

  const unitName = {
    kg: s.unitKg,
    lb: s.unitLb,
    cm: s.unitCm,
    in: s.unitIn,
  } as const;
  const range = (lo: number, hi: number): { min: string; max: string } => ({
    min: asText(lo, locale),
    max: asText(hi, locale),
  });

  /** A height typed or pasted whole in the feet field (`5'11"`, `5 ft 11`) is split into both fields. */
  const splitHeight = (text: string): { feet: string; inches: string } | null => {
    const split = splitFeetAndInches(text);
    if (split === null) return null;
    setHeightFt(split.feet);
    if (split.inches !== '') setHeightIn(split.inches);
    return { feet: split.feet, inches: split.inches === '' ? heightIn : split.inches };
  };
  const feetInches = (n: number): string =>
    fill(s.heightFtIn, {
      feet: String(cmToFeetInches(n).feet),
      inches: asText(cmToFeetInches(n).inches, locale),
    });

  /**
   * Check the height typed and, when it is valid and not what is stored already, write it. Returns
   * `false` when what is typed is not a valid height (the message is on the field, and focus goes
   * there when `focusOnError`).
   */
  const saveHeight = (focusOnError = false): boolean => {
    const refuse = (message: string): false => {
      fail('height', message);
      if (focusOnError) (imperial ? feetField : cmField).current?.focus();
      return false;
    };
    let cm: number | null;
    if (imperial) {
      const split = splitFeetAndInches(heightFt);
      const feetText = split === null ? heightFt : split.feet;
      const inchesText = split !== null && split.inches !== '' ? split.inches : heightIn;
      if (split !== null) {
        setHeightFt(split.feet);
        if (split.inches !== '') setHeightIn(split.inches);
      }
      const ft = parseTypedNumber(feetText);
      const inch = inchesText.trim() === '' ? 0 : parseTypedNumber(inchesText);
      if (ft === null || inch === null || !Number.isInteger(ft)) {
        return refuse(fill(s.errorNumber, { example: '5' }));
      }
      if (inch > MAX_INCHES_PART) return refuse(s.errorInches);
      cm = feetInchesToCm(ft, inch);
    } else {
      cm = parseTypedNumber(heightCm);
    }
    if (cm === null) return refuse(fill(s.errorNumber, { example: '170' }));
    if (cm < HEIGHT_RANGE_CM.min || cm > HEIGHT_RANGE_CM.max) {
      return refuse(
        imperial
          ? fill(s.errorHeightImperial, {
              min: feetInches(HEIGHT_RANGE_CM.min),
              max: feetInches(HEIGHT_RANGE_CM.max),
            })
          : fill(s.errorHeight, {
              ...range(HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max),
              unit: unitName.cm,
            }),
      );
    }
    ok('height');
    setHeightCm(null);
    setHeightFt(null);
    setHeightIn(null);
    // A value that is already stored is not written again (leaving a field must not be a write).
    if (cm !== storedHeight) onProfile('heightCm', cm);
    return true;
  };

  /**
   * Check and write the weight or waist typed. Returns `false` when it was not written: not a valid
   * number (the message is on the field), a weight that needs the one question first, or a failed
   * write. `focusOnError` also moves focus to the field.
   */
  const saveMeasurement = async (
    kind: MeasurementKind,
    { focusOnError = false, fromBlur = false } = {},
  ): Promise<boolean> => {
    const text = kind === 'weight' ? weight : waist;
    const field = kind;
    const target = kind === 'weight' ? weightField : null;
    const parsed = parseMeasurementText(kind, text, units);
    const refuse = (message: string): false => {
      fail(field, message);
      if (focusOnError) target?.current?.focus();
      return false;
    };
    if (parsed.kind === 'number') return refuse(fill(s.errorNumber, { example: parsed.example }));
    if (parsed.kind === 'range') {
      return refuse(
        fill(kind === 'weight' ? s.errorWeight : s.errorWaist, {
          ...range(parsed.min, parsed.max),
          unit: unitName[parsed.unit],
        }),
      );
    }
    const value = parsed.value;
    const today = localDayText(clock());
    const sameToday = body.find((m) => m.kind === kind && m.day === today);
    // Leaving the field with what is already recorded for today is not a write.
    if (fromBlur && sameToday !== undefined && Math.abs(sameToday.value - value) < 1e-9) {
      ok(field);
      (kind === 'weight' ? setWeight : setWaist)(null);
      return true;
    }
    if (kind === 'weight' && !confirmingWeight) {
      const last = body.find((m) => m.kind === 'weight' && m.day !== today);
      if (weightNeedsConfirmation(value, last?.value)) {
        ok(field);
        setConfirmingWeight(true);
        return false;
      }
    }
    ok(field);
    try {
      await pref.record(kind, value, clock(), today);
      if (live()) {
        (kind === 'weight' ? setWeight : setWaist)(null);
        setConfirmingWeight(false);
        setStatus('');
      }
      return true;
    } catch {
      if (live()) setStatus(s.saveFailed);
      return false;
    }
  };

  // The welcome settles what is typed before it moves on (see `commitRef`).
  const commit = async (): Promise<boolean> => {
    if (heightCmDraft !== null || heightFtDraft !== null || heightInDraft !== null) {
      const typed = (imperial ? heightFt + heightIn : heightCm).trim() !== '';
      if (typed && !saveHeight(true)) return false;
    }
    // The question is already on screen: Next is not an answer to it.
    if (confirmingWeight && weight.trim() !== '') {
      document.querySelector<HTMLElement>('[data-change]')?.focus();
      return false;
    }
    if (weight.trim() !== '' && !(await saveMeasurement('weight', { focusOnError: true }))) {
      return false;
    }
    return true;
  };
  useEffect(() => {
    if (commitRef === undefined) return;
    commitRef.current = commit;
    return () => {
      commitRef.current = null;
    };
  });

  const remove = async (kind: MeasurementKind, day: string): Promise<void> => {
    try {
      await pref.removeMeasurement(kind, day);
      if (live()) setStatus('');
    } catch {
      if (live()) setStatus(s.saveFailed);
    }
  };

  const display = (kind: MeasurementKind, value: number): string =>
    kind === 'weight'
      ? `${asText(imperial ? kgToLb(value) : value, locale)} ${imperial ? unitName.lb : unitName.kg}`
      : `${asText(imperial ? cmToInches(value) : value, locale)} ${imperial ? unitName.in : unitName.cm}`;

  return (
    <Section title={title ?? s.bodyTitle}>
      <Prose>{s.bodyHelp}</Prose>
      <ChoiceGroup<UnitSystem>
        label={s.units}
        choices={[
          { value: 'metric', label: s.unitsOptions.metric },
          { value: 'imperial', label: s.unitsOptions.imperial },
        ]}
        value={units}
        onChange={(value) => {
          dropDrafts();
          onProfile('units', value);
        }}
      />
      <p className="text-body-small text-ink-soft">{s.unitsHelp}</p>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="font-display text-label text-thread mb-1.5 p-0">{s.heightLabel}</legend>
        <p className="text-body-small text-ink-soft">{s.heightHelp}</p>
        {imperial ? (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label={s.heightFt}
                inputMode="decimal"
                autoComplete="off"
                value={heightFt}
                ref={feetField}
                aria-describedby={errors['height'] ? heightErrorId : undefined}
                onChange={(e) => setHeightFt(e.target.value)}
                onPaste={(e) => {
                  if (splitHeight(e.clipboardData.getData('text')) !== null) e.preventDefault();
                }}
                onBlur={(e) => {
                  void splitHeight(e.target.value);
                  // In the welcome there is no Save button to find: what was typed is kept on leaving,
                  // once both feet and inches are settled (never a transient "5 ft 0 in" on the way to
                  // the inches field).
                  if (e.relatedTarget === inchesField.current) return;
                  if (compact && e.target.value.trim() !== '' && heightIn.trim() !== '')
                    saveHeight();
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label={s.heightIn}
                inputMode="decimal"
                autoComplete="off"
                value={heightIn}
                ref={inchesField}
                aria-describedby={errors['height'] ? heightErrorId : undefined}
                onChange={(e) => setHeightIn(e.target.value)}
                onBlur={() => {
                  if (compact && heightFt.trim() !== '') saveHeight();
                }}
              />
            </div>
          </div>
        ) : (
          <TextField
            label={s.heightCm}
            inputMode="decimal"
            autoComplete="off"
            value={heightCm}
            ref={cmField}
            onChange={(e) => setHeightCm(e.target.value)}
            onBlur={() => {
              if (compact && heightCmDraft !== null && heightCm.trim() !== '') saveHeight();
            }}
            message={errors['height']}
          />
        )}
        {imperial && errors['height'] && (
          <p id={heightErrorId} role="status" className="text-body-small text-ink-soft">
            {errors['height']}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => saveHeight()}>
            {s.heightSave}
          </Button>
          {storedHeight !== undefined && (
            <Button variant="secondary" onClick={() => onProfile('heightCm', undefined)}>
              {s.heightRemove}
            </Button>
          )}
        </div>
      </fieldset>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="font-display text-label text-thread mb-1.5 p-0">{s.weightLabel}</legend>
        <p className="text-body-small text-ink-soft">{s.weightHelp}</p>
        {showNumbers && latestWeight !== undefined && (
          <p className="text-body-small text-ink-soft">
            {fill(s.weightFrom, {
              date: formatDay(latestWeight.day, locale),
              value: display('weight', latestWeight.value),
            })}
          </p>
        )}
        <TextField
          label={imperial ? s.weightLb : s.weightKg}
          inputMode="decimal"
          autoComplete="off"
          value={weight}
          ref={weightField}
          onChange={(e) => {
            setWeight(e.target.value);
            setConfirmingWeight(false);
          }}
          onBlur={() => {
            if (compact && weight.trim() !== '' && !confirmingWeight) {
              void saveMeasurement('weight', { fromBlur: true });
            }
          }}
          message={errors['weight']}
        />
        {confirmingWeight && (
          <WeightConfirm
            onSave={() => void saveMeasurement('weight')}
            onChange={() => {
              setConfirmingWeight(false);
              weightField.current?.focus();
            }}
          />
        )}
        <div>
          <Button variant="secondary" onClick={() => void saveMeasurement('weight')}>
            {s.weightSave}
          </Button>
        </div>
        {!compact && weights.length > 0 && (
          <div>
            <h3 className="font-display text-label text-thread">{s.weighIns}</h3>
            <ul className="flex flex-col">
              {weights.map((m) => (
                <li
                  key={m.day}
                  className="border-seam flex min-h-12 items-center justify-between gap-3 border-b"
                >
                  <span className="text-body">
                    {formatDay(m.day, locale)}
                    {showNumbers ? `: ${display('weight', m.value)}` : ''}
                  </span>
                  <button
                    type="button"
                    aria-label={fill(s.weighInRemove, { date: formatDay(m.day, locale) })}
                    onClick={() => void remove('weight', m.day)}
                    className="text-ink inline-flex min-h-12 min-w-12 items-center justify-center text-body-small underline underline-offset-4"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <a
              href={hrefs.progress}
              className="text-ink inline-flex min-h-12 items-center text-body-small underline underline-offset-4"
            >
              {s.weighInsAll}
            </a>
          </div>
        )}
      </fieldset>

      {!compact && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="font-display text-label text-thread mb-1.5 p-0">{s.waistLabel}</legend>
          <details className="group text-body-small text-ink-soft">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="border-ink-soft size-2 shrink-0 -rotate-45 border-r-2 border-b-2 transition-transform group-open:rotate-45"
              />
              <span>{s.waistHow}</span>
            </summary>
            <p className="pb-2">{s.waistHowBody}</p>
          </details>
          <TextField
            label={imperial ? s.waistIn : s.waistCm}
            inputMode="decimal"
            autoComplete="off"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            message={errors['waist']}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void saveMeasurement('waist')}>
              {s.waistSave}
            </Button>
          </div>
          {latestWaist !== undefined && (
            <div className="flex min-h-12 items-center justify-between gap-3">
              <p className="text-body-small text-ink-soft">
                {showNumbers
                  ? fill(s.waistFrom, {
                      date: formatDay(latestWaist.day, locale),
                      value: display('waist', latestWaist.value),
                    })
                  : fill(all.progress.hiddenWaist, { date: formatDay(latestWaist.day, locale) })}
              </p>
              <button
                type="button"
                aria-label={fill(s.waistRemove, { date: formatDay(latestWaist.day, locale) })}
                onClick={() => void remove('waist', latestWaist.day)}
                className="text-ink inline-flex min-h-12 min-w-12 items-center justify-center text-body-small underline underline-offset-4"
              >
                ×
              </button>
            </div>
          )}
        </fieldset>
      )}
      {/* Once, covering the weight, the height and the waist (docs/no-dark-patterns-standard.md). */}
      <SupportLine />
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {status}
      </p>
    </Section>
  );
}
