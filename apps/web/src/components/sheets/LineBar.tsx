import type { FoodGroup } from '@anc/core';
import { useStrings } from '../../i18n';
import { cn } from '../primitives/cn';
import { LineSwatch } from '../primitives/GroupMarker';

const LINES = ['vegFruit', 'protein', 'starch', 'dairy'] as const satisfies readonly FoodGroup[];

/**
 * Four cells in a 2px porcelain frame, one per line. A line that stopped shows its swatch and
 * name; a line that did not is drawn dashed and neutral with "· passed" in text (never red).
 */
export function LineBar({ present }: { readonly present: readonly FoodGroup[] }) {
  const s = useStrings();
  return (
    <ul aria-label={s.lineBar.label} className="border-porcelain grid grid-cols-4 border-2">
      {LINES.map((group, i) => {
        const stopped = present.includes(group);
        return (
          <li
            key={group}
            className={cn(
              'font-display text-label flex min-w-0 flex-col gap-1.5 px-2 pt-2.5 pb-2 uppercase',
              i > 0 && 'border-rule border-l-2',
              !stopped && 'text-signal-muted',
            )}
          >
            {stopped ? (
              <LineSwatch group={group} className="h-2 w-full" />
            ) : (
              <span
                aria-hidden="true"
                className="border-signal-muted mt-0.5 block h-2 w-full border-t-[3px] border-dashed"
              />
            )}
            <span className="break-words">
              {s.groups[group]}
              {!stopped && ` ${s.lineBar.passedSuffix}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
