import { useId } from 'react';
import { useStrings } from '../../i18n';
import { VersionTag } from '../primitives';

export interface Tier {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** An unavailable tier: drawn at 0.75 opacity, and cannot be chosen. */
  readonly disabled?: boolean;
  /** Adds the "Not in v1" tag. Only for a tier that is out of scope for version 1, not one that is merely unavailable yet. */
  readonly versionTag?: boolean;
}

/**
 * The AI tier choice: a native radio group (arrow keys and roving focus come from the platform)
 * drawn as full-width outlined rows with a 24px ring.
 */
export function TierRadio({
  tiers,
  value,
  onChange,
  label,
}: {
  readonly tiers: readonly Tier[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  /** Accessible name of the group; defaults to "AI tier". */
  readonly label?: string;
}) {
  const s = useStrings().settings;
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label ?? s.aiTier} className="mt-3.5 flex flex-col gap-2.5">
      {tiers.map((tier) => (
        // eslint-disable-next-line jsx-a11y/label-has-associated-control -- the input is nested; the text sits in nested spans the rule cannot see.
        <label
          key={tier.id}
          className={[
            'group grid w-full grid-cols-[1.75rem_1fr] gap-3 border-2 p-3.5 text-left',
            'border-control has-[:checked]:border-porcelain',
            'has-[:focus-visible]:outline-line-starch has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2',
            tier.disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer',
          ].join(' ')}
        >
          <input
            type="radio"
            name={name}
            value={tier.id}
            checked={value === tier.id}
            disabled={tier.disabled === true}
            onChange={() => onChange(tier.id)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className="border-porcelain mt-0.5 grid size-6 place-items-center rounded-full border-[3px]"
          >
            <span className="group-has-[:checked]:bg-porcelain size-2.5 rounded-full" />
          </span>
          <span>
            <span className="font-display text-title block uppercase">
              {tier.title}
              {tier.versionTag === true && <VersionTag spoken={s.v2Spoken}>{s.v2Tag}</VersionTag>}
            </span>
            <span className="text-porcelain-dim mt-0.5 block text-aside">{tier.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
