import type { FoodGroup } from '@anc/core';
import { ChevronIcon, cn } from '../primitives';
import { LineSwatch } from '../primitives/GroupMarker';

export interface DepartureRow {
  readonly id: string;
  /** The line colour of the row's bar (decorative; the title names the row). */
  readonly line: FoodGroup;
  readonly title: string;
  readonly subtitle: string;
  /** Plain-text status, e.g. "Free quota". */
  readonly status: string;
  readonly onSelect: () => void;
}

/** The settings board: line segment, title, subtitle, status text and a chevron per row. */
export function DepartureBoard({
  rows,
  className,
}: {
  rows: readonly DepartureRow[];
  className?: string;
}) {
  return (
    <ul className={cn('mt-2', className)}>
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={row.onSelect}
            className="border-rule flex min-h-17 w-full cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1 border-b py-2 text-left"
          >
            <LineSwatch group={row.line} />
            <span className="min-w-0 flex-1 basis-32">
              <span className="font-display text-title block uppercase">{row.title}</span>
              <span className="text-signal-muted text-meta">{row.subtitle}</span>
            </span>
            <span className="font-display text-porcelain-dim text-aside font-semibold tracking-[0.06em] uppercase">
              {row.status}
            </span>
            <ChevronIcon size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}
