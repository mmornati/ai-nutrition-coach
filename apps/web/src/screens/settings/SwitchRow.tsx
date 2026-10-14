import { useId } from 'react';
import { CheckIcon, cn } from '../../components/primitives';

/**
 * A labelled on/off switch: a native checkbox with role "switch", drawn as a square tick box in a
 * 48px row. The name is the title; the longer help is the description. A tick marks "on", so the
 * state never rests on colour alone.
 */
export function SwitchRow({
  title,
  help,
  checked,
  disabled = false,
  onChange,
}: {
  readonly title: string;
  readonly help: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const helpId = `${id}-help`;
  return (
    <label
      className={cn(
        'flex min-h-12 items-start gap-3 py-2',
        disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-labelledby={titleId}
        aria-describedby={helpId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'border-control-raised text-enamel mt-0.5 grid size-6 shrink-0 place-items-center border-2',
          'peer-checked:border-porcelain peer-checked:bg-porcelain',
          'peer-focus-visible:outline-line-starch peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2',
          '[&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
        )}
      >
        <CheckIcon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span id={titleId} className="text-lead block font-medium">
          {title}
        </span>
        <span id={helpId} className="text-porcelain-dim text-body-small mt-0.5 block">
          {help}
        </span>
      </span>
    </label>
  );
}
