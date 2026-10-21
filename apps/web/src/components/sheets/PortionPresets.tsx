import type { QuantityRange } from '@anc/core';
import { quantityLabel } from '../../catalog';
import { useLocale, useStrings } from '../../i18n';
import type { Locale } from '../../i18n/locale';
import { cn } from '../primitives/cn';
import { formatWeight } from '../nutrition/format';
import { effectivePresets, sameQuantity } from './foods';

export interface PortionPresetsProps {
  readonly presets: readonly QuantityRange[];
  readonly value: QuantityRange;
  readonly onChange: (preset: QuantityRange) => void;
  /** True while a typed weight is the quantity: no preset shows as chosen. */
  readonly deselected?: boolean;
  /** Accessible name of the group; defaults to "Portion". */
  readonly label?: string;
  /** On raised enamel (sheets): uses the raised control edge. Default true. */
  readonly raised?: boolean;
}

/**
 * Honest portion ranges as toggle buttons (>= 48px), with the weight a preset stands for when the
 * catalogue knows it ("~1 fist · ≈150 g"). The selected one flips to porcelain.
 */
export function PortionPresets({
  presets,
  value,
  onChange,
  deselected = false,
  label,
  raised = true,
}: PortionPresetsProps) {
  const s = useStrings();
  const { locale } = useLocale();
  const shown = effectivePresets(presets);
  return (
    <div role="group" aria-label={label ?? s.portion.label} className="flex flex-wrap gap-2">
      {shown.map((preset) => {
        const selected = !deselected && sameQuantity(preset, value);
        return (
          <button
            key={`${preset.unit}:${preset.low}-${preset.high}:${preset.displayLabel}`}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(preset)}
            className={cn(
              'font-display quantity min-h-12 min-w-12 cursor-pointer rounded-none border-2 px-3.5 text-ui font-semibold tracking-[0.05em]',
              selected
                ? 'border-porcelain bg-porcelain text-enamel'
                : cn(
                    'text-porcelain bg-transparent',
                    raised ? 'border-control-raised' : 'border-control',
                  ),
            )}
          >
            {quantityLabel(preset, locale)}
            {gramHint(preset, locale)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The weight a preset stands for, after its words: " · ≈150 g" for a guess, " · 100 g" when exact.
 * Nothing when the label already is the weight ("100 g"), which would only say it twice.
 */
export function gramHint(preset: QuantityRange, locale: Locale): string {
  if (preset.grams === undefined) return '';
  const hint = formatWeight(preset.grams, preset.gramsEstimated === true, locale);
  // Compare without spacing: labels and the formatter may use a plain, no-break or narrow space.
  const label = squash(quantityLabel(preset, locale));
  const plain = squash(formatWeight(preset.grams, false, locale));
  return label === squash(hint) || label === plain ? '' : ` · ${hint}`;
}

const squash = (text: string): string => text.replace(/\s/g, '');
