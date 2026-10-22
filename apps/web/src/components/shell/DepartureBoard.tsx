import { ChevronIcon, cn } from '../primitives';

export interface DepartureRow {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** Plain-text status, e.g. "Free quota". */
  readonly status: string;
  readonly onSelect: () => void;
}

/** The settings list: title, subtitle, status text and a chevron per row, between seams. */
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
            className="border-seam flex min-h-17 w-full cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1 border-b py-2 text-left"
          >
            <span className="min-w-0 flex-1 basis-32">
              <span className="font-display text-title block">{row.title}</span>
              <span className="text-thread text-meta">{row.subtitle}</span>
            </span>
            <span className="font-display text-thread text-aside font-semibold">{row.status}</span>
            <ChevronIcon size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}
