import type { FoodGroup } from '@anc/core';
import { useStrings } from '../../i18n';
import { GroupMarker } from '../primitives/GroupMarker';

export interface EntryItem {
  readonly id: string;
  readonly name: string;
  /** Honest range text, e.g. "~2 fists". */
  readonly quantity: string;
  readonly group: FoodGroup;
}

/** A ruled list (2px porcelain top rule, 1px night rules); quantity flush right, tabular. */
export function EntryList({ entries }: { readonly entries: readonly EntryItem[] }) {
  const s = useStrings();
  return (
    <ul aria-label={s.entries.label} className="border-ink border-t-2">
      {entries.map((entry) => (
        <li key={entry.id} className="border-seam border-b py-3">
          <div className="flex items-baseline justify-between gap-3 text-lead">
            <span className="min-w-0">{entry.name}</span>
            <span className="font-display quantity text-quantity font-semibold whitespace-nowrap">
              {entry.quantity}
            </span>
          </div>
          <GroupMarker group={entry.group} className="mt-1.5" />
        </li>
      ))}
    </ul>
  );
}
