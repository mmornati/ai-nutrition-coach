import { useRef, useState } from 'react';
import { dayNumberOf, dayTextOf, localDayText, type MeasurementKind } from '@anc/core';
import { Button, TextField } from '../../components/primitives';
import { Sheet } from '../../components/sheets';
import { SupportLine } from '../../components/nutrition';
import { fill, useLocale, useStrings, type Strings } from '../../i18n';
import type { Locale } from '../../i18n/locale';
import { useDay } from '../../app/day-context';
import { useSession } from '../../app/session';
import {
  kgToLb,
  cmToInches,
  parseMeasurementText,
  weightNeedsConfirmation,
} from '../settings/body-input';
import { WeightConfirm } from '../settings/WeightConfirm';
import { useShowNumbers } from '../../components/nutrition';
import { useMeasurements, useUnits } from './use-weight-progress';

/** The instant stored with a weigh-in: now for today, midday local for another day. */
function momentFor(day: string, now: number): number {
  if (day === localDayText(now)) return now;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).getTime();
}

const oneDecimal = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(value);

export interface WeighInTarget {
  /** The local day (`yyyy-MM-dd`) to open on; today when absent. */
  readonly day?: string;
  /** The kind being edited, for a prefilled value; both fields open either way. */
  readonly kind?: MeasurementKind;
}

/**
 * The quick weigh-in: weight for a chosen day (today by default, any earlier day, never a later
 * one), a waist if the person wants, in the units of their profile, a decimal comma accepted. One
 * value per day: a second one replaces the first and the sheet says so, without echoing the figure.
 * The protocol hint and the support line sit here (docs/adr/0008). The sheet works with numbers
 * hidden; the field of an edited entry then starts empty rather than showing the old figure.
 */
export function WeighInSheet({
  open,
  onClose,
  target,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly target?: WeighInTarget | undefined;
}) {
  const s = useStrings();
  return (
    <Sheet open={open} onClose={onClose} title={s.weighIn.title} subtitle={s.weighIn.help}>
      {open && <WeighInForm onClose={onClose} target={target} />}
    </Sheet>
  );
}

function WeighInForm({
  onClose,
  target,
}: {
  readonly onClose: () => void;
  readonly target: WeighInTarget | undefined;
}) {
  const all: Strings = useStrings();
  const s = all.weighIn;
  const p = all.profile;
  const { locale } = useLocale();
  const { profile: pref, clock, live } = useSession();
  const day = useDay();
  const body = useMeasurements();
  const units = useUnits();
  const imperial = units === 'imperial';
  const showNumbers = useShowNumbers();
  const today = localDayText(clock());
  const [chosenDay, setChosenDay] = useState(target?.day ?? today);
  const existing = (kind: MeasurementKind, forDay: string) =>
    body.find((m) => m.kind === kind && m.day === forDay);
  const prefill = (kind: MeasurementKind): string => {
    if (!showNumbers || target?.day === undefined) return '';
    const m = existing(kind, target.day);
    if (m === undefined) return '';
    const shown =
      kind === 'weight'
        ? imperial
          ? kgToLb(m.value)
          : m.value
        : imperial
          ? cmToInches(m.value)
          : m.value;
    return oneDecimal(shown, locale);
  };
  const [weight, setWeight] = useState(() => prefill('weight'));
  const [waist, setWaist] = useState(() => prefill('waist'));
  const [message, setMessage] = useState<{
    field: 'day' | 'weight' | 'waist' | 'form';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // The typed weight is far from the last one: asked once, then saved as typed or changed.
  const [confirming, setConfirming] = useState(false);
  const weightField = useRef<HTMLInputElement>(null);

  const replacing =
    existing('weight', chosenDay) !== undefined && weight.trim() !== ''
      ? s.replaces
      : existing('waist', chosenDay) !== undefined && waist.trim() !== ''
        ? s.replacesWaist
        : '';

  const unitName = { kg: p.unitKg, lb: p.unitLb, cm: p.unitCm, in: p.unitIn } as const;
  const rangeText = (v: number): string => oneDecimal(v, locale);

  const save = async (): Promise<void> => {
    if (busy) return;
    // An empty or impossible date (the field was cleared, or 31 February) says so; a later one asks
    // for today or earlier.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosenDay) || dayTextOf(dayNumberOf(chosenDay)) !== chosenDay) {
      setMessage({ field: 'day', text: s.invalidDay });
      return;
    }
    if (chosenDay > today) {
      setMessage({ field: 'day', text: s.futureDay });
      return;
    }
    if (weight.trim() === '' && waist.trim() === '') {
      setMessage({ field: 'form', text: s.needsValue });
      return;
    }
    const entries: { kind: MeasurementKind; value: number }[] = [];
    for (const kind of ['weight', 'waist'] as const) {
      const text = kind === 'weight' ? weight : waist;
      if (text.trim() === '') continue;
      const parsed = parseMeasurementText(kind, text, units);
      if (parsed.kind === 'number') {
        setMessage({ field: kind, text: fill(p.errorNumber, { example: parsed.example }) });
        return;
      }
      if (parsed.kind === 'range') {
        setMessage({
          field: kind,
          text: fill(kind === 'weight' ? p.errorWeight : p.errorWaist, {
            min: rangeText(parsed.min),
            max: rangeText(parsed.max),
            unit: unitName[parsed.unit],
          }),
        });
        return;
      }
      entries.push({ kind, value: parsed.value });
    }
    const typedWeight = entries.find((e) => e.kind === 'weight');
    if (typedWeight !== undefined && !confirming) {
      // The last weigh-in on any other day: replacing this very day's is not a jump from it.
      const last = body.find((m) => m.kind === 'weight' && m.day !== chosenDay);
      if (weightNeedsConfirmation(typedWeight.value, last?.value)) {
        setConfirming(true);
        return;
      }
    }
    if (!pref.trusted()) {
      setMessage({ field: 'form', text: s.saveFailed });
      return;
    }
    setBusy(true);
    try {
      const at = momentFor(chosenDay, clock());
      const from = target?.day;
      for (const entry of entries) {
        // An entry whose date was changed moves: the original day's is removed with it.
        if (from !== undefined && from !== chosenDay && existing(entry.kind, from) !== undefined) {
          await pref.moveMeasurement(entry.kind, from, entry.value, at, chosenDay);
        } else {
          await pref.record(entry.kind, entry.value, at, chosenDay);
        }
      }
      day.setNotice((a) => a.weighIn.saved);
      if (live()) onClose();
    } catch {
      if (live()) setMessage({ field: 'form', text: s.saveFailed });
    } finally {
      if (live()) setBusy(false);
    }
  };

  const messageFor = (field: 'day' | 'weight' | 'waist'): string | undefined =>
    message?.field === field ? message.text : undefined;

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField
        label={s.day}
        type="date"
        max={today}
        value={chosenDay}
        onChange={(e) => {
          setChosenDay(e.target.value);
          setMessage(null);
          setConfirming(false);
        }}
        message={messageFor('day')}
      />
      <TextField
        label={imperial ? p.weightLb : p.weightKg}
        inputMode="decimal"
        autoComplete="off"
        value={weight}
        data-autofocus
        ref={weightField}
        onChange={(e) => {
          setWeight(e.target.value);
          setMessage(null);
          setConfirming(false);
        }}
        message={messageFor('weight')}
      />
      <TextField
        label={imperial ? s.waistIn : s.waistCm}
        inputMode="decimal"
        autoComplete="off"
        value={waist}
        onChange={(e) => {
          setWaist(e.target.value);
          setMessage(null);
        }}
        message={messageFor('waist')}
      />
      <p className="text-body-small text-ink-soft">
        {imperial ? s.protocolImperial : s.protocolMetric}
      </p>
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {replacing}
      </p>
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {message?.field === 'form' ? message.text : ''}
      </p>
      {confirming && (
        <WeightConfirm
          busy={busy}
          onSave={() => void save()}
          onChange={() => {
            setConfirming(false);
            weightField.current?.focus();
          }}
        />
      )}
      <SupportLine />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy}>
          {s.save}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {s.cancel}
        </Button>
      </div>
    </form>
  );
}
