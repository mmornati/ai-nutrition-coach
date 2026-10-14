import type { FoodGroup } from '@anc/core';
import { useStrings } from '../../i18n';
import { cn } from './cn';
import { lineDef } from './lines';

// "Other" has no line: a dashed neutral segment, never a colour.
const OTHER_BAR = 'border-t-[3px] border-dashed border-signal-muted';

const barClass = (group: FoodGroup): string => (group === 'other' ? OTHER_BAR : lineDef(group).bg);

/** The line swatch for a food group. Always paired with the group's name in text. */
export function LineSwatch({ group, className }: { group: FoodGroup; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-1.5 w-6 shrink-0', barClass(group), className)}
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
