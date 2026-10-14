import type { QuantityRange } from '@anc/core';
import { useStrings } from '../../i18n';
import { cn } from '../primitives/cn';
import { effectivePresets, sameQuantity } from './foods';

export interface PortionPresetsProps {
  readonly presets: readonly QuantityRange[];
  readonly value: QuantityRange;
  readonly onChange: (preset: QuantityRange) => void;
  /** Accessible name of the group; defaults to "Portion". */
  readonly label?: string;
  /** On raised enamel (sheets): uses the raised control edge. Default true. */
  readonly raised?: boolean;
}

/** Honest portion ranges as toggle buttons (>= 48px). The selected one flips to porcelain. */
export function PortionPresets({
  presets,
  value,
  onChange,
  label,
  raised = true,
}: PortionPresetsProps) {
  const s = useStrings();
  const shown = effectivePresets(presets);
  return (
    <div role="group" aria-label={label ?? s.portion.label} className="flex flex-wrap gap-2">
      {shown.map((preset) => {
        const selected = sameQuantity(preset, value);
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
            {preset.displayLabel}
          </button>
        );
      })}
    </div>
  );
}
