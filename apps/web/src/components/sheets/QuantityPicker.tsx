import { useId, useState } from 'react';
import { gramsQuantity, type DatabaseFood, type QuantityRange } from '@anc/core';
import { useLocale, useStrings } from '../../i18n';
import { formatWeight, previewLine } from '../nutrition/format';
import { useShowNumbers } from '../nutrition/use-show-numbers';
import { TextField } from '../primitives/TextField';
import { PortionPresets } from './PortionPresets';

const MIN_GRAMS = 1;
const MAX_GRAMS = 5000;

/**
 * A typed weight as a number: a comma or a dot for the decimal, 1 to 5000. `null` for anything
 * else (letters, a second separator, zero, too large). The empty string is not a weight either.
 */
export function parseGrams(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= MIN_GRAMS && n <= MAX_GRAMS ? n : null;
}

const isTypedGrams = (q: QuantityRange): boolean =>
  q.unit === 'g' && q.grams !== undefined && q.gramsEstimated !== true;

export interface QuantityPickerProps {
  readonly presets: readonly QuantityRange[];
  readonly value: QuantityRange;
  readonly onChange: (quantity: QuantityRange) => void;
  /** The food being logged: with per-100 g nutrients it gives the live preview. */
  readonly food?: DatabaseFood | undefined;
  /** Accessible name of the preset group. */
  readonly label?: string;
  readonly raised?: boolean;
}

/**
 * The portion presets plus a "Grams" field. Typing a weight chooses it as the quantity and
 * un-chooses the presets; choosing a preset clears the field. When the food has nutrients and the
 * weight is known, one line shows what that weight holds (unless numbers are turned off).
 */
export function QuantityPicker({
  presets,
  value,
  onChange,
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

  const typed = isTypedGrams(value);
  const shownText = typed || invalid ? text : '';

  const type = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setInvalid(false);
      return;
    }
    const grams = parseGrams(next);
    setInvalid(grams === null);
    if (grams !== null) {
      onChange(gramsQuantity(grams, { displayLabel: formatWeight(grams, false, locale) }));
    }
  };

  const pick = (preset: QuantityRange) => {
    setText('');
    setInvalid(false);
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
          <span className="text-lead text-porcelain-dim pb-4">{presetWeight}</span>
        )}
      </div>
      {message !== null && (
        <p id={messageId} role="status" className="text-body-small text-porcelain-dim">
          {message}
        </p>
      )}
    </div>
  );
}
