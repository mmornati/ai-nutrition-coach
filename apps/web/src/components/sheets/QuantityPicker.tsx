import { useEffect, useId, useRef, useState } from 'react';
import { MAX_GRAMS, gramsQuantity, type DatabaseFood, type QuantityRange } from '@anc/core';
import { useLocale, useStrings } from '../../i18n';
import { formatWeight, previewLine } from '../nutrition/format';
import { useShowNumbers } from '../nutrition/use-show-numbers';
import { TextField } from '../primitives/TextField';
import { PortionPresets } from './PortionPresets';
import { effectivePresets, sameQuantity } from './foods';

const MIN_GRAMS = 0.1;

/**
 * A typed weight as a number: a comma or a dot for the decimal, 0.1 to 5000, rounded to one
 * decimal (a pinch of spice is 0.5 g). `null` for anything else (letters, a second separator,
 * zero, too large). The empty string is not a weight either.
 */
export function parseGrams(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Math.round(Number(t) * 10) / 10;
  return Number.isFinite(n) && n >= MIN_GRAMS && n <= MAX_GRAMS ? n : null;
}

export interface QuantityPickerProps {
  readonly presets: readonly QuantityRange[];
  readonly value: QuantityRange;
  readonly onChange: (quantity: QuantityRange) => void;
  /**
   * Told whether the Grams field holds something loggable: `false` while it holds text that is not
   * a weight (the quantity then stays what it was, so the parent must keep Log off), `true`
   * otherwise and when the picker goes away.
   */
  readonly onValidityChange?: (valid: boolean) => void;
  /** The food being logged: with per-100 g nutrients it gives the live preview. */
  readonly food?: DatabaseFood | undefined;
  /** Accessible name of the preset group. */
  readonly label?: string;
  readonly raised?: boolean;
}

/**
 * The portion presets plus a "Grams" field. Typing a weight chooses it as the quantity and
 * un-chooses the presets; choosing a preset clears the field; emptying the field goes back to the
 * preset that was chosen before (or the first). Text that is not a weight reports itself through
 * `onValidityChange` instead of leaving a stale quantity to be logged. When the food has nutrients and the
 * weight is known, one line shows what that weight holds (unless numbers are turned off).
 */
export function QuantityPicker({
  presets,
  value,
  onChange,
  onValidityChange,
  food,
  label,
  raised = true,
}: QuantityPickerProps) {
  const t = useStrings().nutrition;
  const { locale } = useLocale();
  const showNumbers = useShowNumbers();
  const messageId = useId();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  // Whether the quantity is a typed weight: explicit, never inferred from the quantity's shape (the
  // exact "100 g" preset has the same shape as a typed 100).
  const [typed, setTyped] = useState(false);
  const lastPreset = useRef<QuantityRange>(
    presets.find((p) => sameQuantity(p, value)) ?? effectivePresets(presets)[0] ?? value,
  );
  const reportValidity = useRef(onValidityChange);
  useEffect(() => {
    reportValidity.current = onValidityChange;
  });
  // When the picker goes away (food changed, unticked, sheet closed) it can no longer be invalid.
  useEffect(() => () => reportValidity.current?.(true), []);

  const shownText = typed || invalid ? text : '';

  const type = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setInvalid(false);
      setTyped(false);
      onValidityChange?.(true);
      onChange(lastPreset.current);
      return;
    }
    const grams = parseGrams(next);
    setInvalid(grams === null);
    onValidityChange?.(grams !== null);
    if (grams !== null) {
      setTyped(true);
      onChange(gramsQuantity(grams, { displayLabel: formatWeight(grams, false, locale) }));
    }
  };

  const pick = (preset: QuantityRange) => {
    lastPreset.current = preset;
    setText('');
    setInvalid(false);
    setTyped(false);
    onValidityChange?.(true);
    onChange(preset);
  };

  const presetWeight =
    !typed && value.grams !== undefined ? formatWeight(value.grams, true, locale) : null;
  const preview = showNumbers && !invalid ? previewLine(food, value.grams, locale) : null;

  const message = invalid ? t.gramsInvalid : preview;

  return (
    <div className="flex flex-col gap-3">
      <PortionPresets
        presets={presets}
        value={value}
        deselected={typed}
        onChange={pick}
        {...(label === undefined ? {} : { label })}
        raised={raised}
      />
      <div className="flex items-end gap-3">
        <div className="w-40">
          <TextField
            label={t.gramsLabel}
            value={shownText}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={invalid ? true : undefined}
            aria-describedby={message === null ? undefined : messageId}
            onChange={(e) => type(e.target.value)}
          />
        </div>
        {presetWeight !== null && (
          <span className="text-lead text-ink-soft pb-4">{presetWeight}</span>
        )}
      </div>
      {message !== null && (
        <p id={messageId} role="status" className="text-body-small text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
