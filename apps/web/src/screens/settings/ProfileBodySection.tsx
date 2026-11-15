import { useId, useState, useSyncExternalStore } from 'react';
import {
  HEIGHT_RANGE_CM,
  MEASUREMENT_RANGE,
  localDayText,
  type MeasurementKind,
  type Profile,
  type UnitSystem,
} from '@anc/core';
import { SupportLine } from '../../components/nutrition';
import { Button, TextField } from '../../components/primitives';
import { fill, useLocale, useStrings } from '../../i18n';
import type { Locale } from '../../i18n/locale';
import { useSession } from '../../app/session';
import {
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  inchesToCm,
  kgToLb,
  lbToKg,
  MAX_INCHES_PART,
  parseTypedNumber,
  splitFeetAndInches,
} from './body-input';
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
}: {
  readonly profile: Profile | undefined;
  /** Writes one profile field (or removes it); resolves once the screen state is up to date. */
  readonly onProfile: <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => void;
}) {
  const s = useStrings().profile;
  const { locale } = useLocale();
  const { profile: pref, clock, live } = useSession();
  const body = useSyncExternalStore(pref.subscribe, pref.measurementList);
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

  const saveHeight = (): void => {
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
        return fail('height', fill(s.errorNumber, { example: '5' }));
      }
      if (inch > MAX_INCHES_PART) return fail('height', s.errorInches);
      cm = feetInchesToCm(ft, inch);
    } else {
      cm = parseTypedNumber(heightCm);
    }
    if (cm === null) return fail('height', fill(s.errorNumber, { example: '170' }));
    if (cm < HEIGHT_RANGE_CM.min || cm > HEIGHT_RANGE_CM.max) {
      return fail(
        'height',
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
    onProfile('heightCm', cm);
  };

  const saveMeasurement = async (kind: MeasurementKind): Promise<void> => {
    const text = kind === 'weight' ? weight : waist;
    const typed = parseTypedNumber(text);
    const field = kind;
    if (typed === null) {
      return fail(
        field,
        fill(s.errorNumber, {
          example: kind === 'weight' ? (imperial ? '154' : '70') : imperial ? '32' : '81',
        }),
      );
    }
    const value =
      kind === 'weight' ? (imperial ? lbToKg(typed) : typed) : imperial ? inchesToCm(typed) : typed;
    const { min, max } = MEASUREMENT_RANGE[kind];
    if (value < min || value > max) {
      const shown =
        kind === 'weight'
          ? imperial
            ? { ...range(kgToLb(min), kgToLb(max)), unit: unitName.lb }
            : { ...range(min, max), unit: unitName.kg }
          : imperial
            ? { ...range(cmToInches(min), cmToInches(max)), unit: unitName.in }
            : { ...range(min, max), unit: unitName.cm };
      return fail(field, fill(kind === 'weight' ? s.errorWeight : s.errorWaist, shown));
    }
    ok(field);
    try {
      await pref.record(kind, value, clock(), localDayText(clock()));
      if (live()) (kind === 'weight' ? setWeight : setWaist)(null);
      if (live()) setStatus('');
    } catch {
      if (live()) setStatus(s.saveFailed);
    }
  };

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
    <Section title={s.bodyTitle}>
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
                aria-describedby={errors['height'] ? heightErrorId : undefined}
                onChange={(e) => setHeightFt(e.target.value)}
                onPaste={(e) => {
                  if (splitHeight(e.clipboardData.getData('text')) !== null) e.preventDefault();
                }}
                onBlur={(e) => void splitHeight(e.target.value)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label={s.heightIn}
                inputMode="decimal"
                autoComplete="off"
                value={heightIn}
                aria-describedby={errors['height'] ? heightErrorId : undefined}
                onChange={(e) => setHeightIn(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <TextField
            label={s.heightCm}
            inputMode="decimal"
            autoComplete="off"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            message={errors['height']}
          />
        )}
        {imperial && errors['height'] && (
          <p id={heightErrorId} role="status" className="text-body-small text-ink-soft">
            {errors['height']}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={saveHeight}>
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
        {latestWeight !== undefined && (
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
          onChange={(e) => setWeight(e.target.value)}
          message={errors['weight']}
        />
        <div>
          <Button variant="secondary" onClick={() => void saveMeasurement('weight')}>
            {s.weightSave}
          </Button>
        </div>
        {weights.length > 0 && (
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
                    {': '}
                    {display('weight', m.value)}
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
          </div>
        )}
      </fieldset>

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
              {fill(s.waistFrom, {
                date: formatDay(latestWaist.day, locale),
                value: display('waist', latestWaist.value),
              })}
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
      {/* Once, covering the weight, the height and the waist (docs/no-dark-patterns-standard.md). */}
      <SupportLine />
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {status}
      </p>
    </Section>
  );
}
