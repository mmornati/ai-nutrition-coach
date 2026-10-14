import { useId } from 'react';
import { CheckIcon } from '../../components/primitives';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * A row of exclusive choices drawn as square pills: native radios in a fieldset (arrow keys and
 * roving focus come from the platform). The chosen pill is filled and carries a tick, so the
 * state never rests on colour alone.
 */
export function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  readonly label: string;
  readonly choices: readonly Choice<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="font-display text-label text-signal-muted mb-1.5 p-0 uppercase">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <label key={choice.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={choice.value === value}
              onChange={() => onChange(choice.value)}
              className="peer sr-only"
            />
            <span
              className={[
                'font-display text-button inline-flex min-h-12 min-w-16 items-center justify-center gap-2 border-2 px-4 uppercase',
                'border-control text-porcelain',
                'peer-checked:border-porcelain peer-checked:bg-porcelain peer-checked:text-enamel',
                'peer-focus-visible:outline-line-starch peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2',
                '[&>svg]:hidden peer-checked:[&>svg]:block',
              ].join(' ')}
            >
              <CheckIcon size={16} />
              {choice.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
