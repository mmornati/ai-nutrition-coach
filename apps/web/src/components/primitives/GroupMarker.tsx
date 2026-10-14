import type { FoodGroup } from '@anc/core';
import { useStrings } from '../../i18n';
import { cn } from './cn';

const BAR: Record<FoodGroup, string> = {
  vegFruit: 'bg-line-veg',
  protein: 'bg-line-protein',
  starch: 'bg-line-starch',
  dairy: 'bg-line-dairy',
  // "Other" has no line: a dashed neutral segment, never a colour.
  other: 'border-t-[3px] border-dashed border-signal-muted',
};

/** The line swatch for a food group. Always paired with the group's name in text. */
export function LineSwatch({ group, className }: { group: FoodGroup; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-1.5 w-6 shrink-0', BAR[group], className)}
    />
  );
}

/** Swatch plus name: colour is never the only signal. */
export function GroupMarker({ group, className }: { group: FoodGroup; className?: string }) {
  const s = useStrings();
  return (
    <span
      className={cn(
        'font-display text-label text-signal-muted inline-flex items-center gap-2 uppercase',
        className,
      )}
    >
      <LineSwatch group={group} />
      {s.groups[group]}
    </span>
  );
}
