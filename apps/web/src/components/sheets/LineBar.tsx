import type { FoodGroup } from '@anc/core';
import { fill, useStrings } from '../../i18n';
import { cn } from '../primitives/cn';
import { LineSwatch } from '../primitives/GroupMarker';
import { LINE_GROUPS } from '../primitives/lines';

/**
 * Four cells in a white 2px ink frame, one per food group. A group on the plate shows its dyed
 * stripe and name; one that is not shows bare cotton (a dashed seam) with a plain note in text,
 * never red.
 */
export function LineBar({ present }: { readonly present: readonly FoodGroup[] }) {
  const s = useStrings();
  return (
    <ul
      aria-label={s.lineBar.label}
      className="border-ink rounded-cloth grid grid-cols-4 overflow-hidden border-2 bg-raised"
    >
      {LINE_GROUPS.map((group, i) => {
        const stopped = present.includes(group);
        return (
          <li
            key={group}
            className={cn(
              'font-display text-label flex min-w-0 flex-col gap-1.5 px-2 pt-2.5 pb-2',
              i > 0 && 'border-seam border-l-2',
              !stopped && 'text-thread',
            )}
          >
            {stopped ? (
              <LineSwatch group={group} className="h-2.5 w-full rounded-none" />
            ) : (
              <span aria-hidden="true" className="weave-bare block h-2.5 w-full" />
            )}
            <span className="break-words hyphens-auto">
              {stopped ? s.groups[group] : fill(s.lineBar.groupPassed, { name: s.groups[group] })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
