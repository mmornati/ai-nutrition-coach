import type { EpochMs } from '@anc/core';
import { useRef } from 'react';
import { strings, useStrings } from '../../i18n';
import { dayDescription, daySentence, networkDescription, platesCount } from '../../i18n/sentences';
import { LINES } from '../primitives';
import { labelRowTemplate } from './geometry';
import { useElementWidth } from './hooks';
import { weekdayAbbr, weekdayName } from './format';
import { dayKind, describeDay } from './week';
import type { WeekDayData } from './week';

export interface WeekNetworkProps {
  /** Seven days, oldest first, ending today. */
  readonly days: readonly WeekDayData[];
  readonly compact?: boolean;
  readonly className?: string;
}

/** Text alternative: every day, by group name. */
export function weekNetworkDescription(days: readonly WeekDayData[]): string {
  const w = strings().week;
  return networkDescription(
    days.map((d) => daySentence(d.isToday ? w.today : weekdayName(d.date), describeDay(d))),
  );
}

/** The plot is drawn in user units; 680 of them are 42.5rem, so the drawing scales with text. */
const MAX_W = 680;
const MIN_W = 140;
/** Height of the plot: 30 units above the first stripe and below the last, for the towel hems. */
const PAD = 30;

/** Root font size relative to 16px: 2 at 200% text. 1 where layout is not available (jsdom). */
function remScale(): number {
  if (typeof document === 'undefined') return 1;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? px / 16 : 1;
}

/**
 * Seven towels hung side by side: each day's towel carries a dyed stripe for every food group
 * that appeared that day, and a dashed bare-cotton seam where it did not. Today is outlined.
 *
 * Only the towels and stripes are SVG, in user units, so the drawing scales as a whole. Every piece
 * of text (day headers, line names) is HTML laid out by CSS grid, so it reflows with the text
 * size instead of colliding (WCAG 1.4.4). The wording is on the wrapper as one image label.
 */
export function WeekNetwork({ days, compact = false, className = '' }: WeekNetworkProps) {
  const { week: w, groups } = useStrings();
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(ref, 360);
  // Measured in rem-relative units, so the drawing is never scaled up past the text around it.
  const W = Math.min(Math.max(measured / remScale(), MIN_W), MAX_W);
  const H = compact ? 214 : 234;
  const gap = (H - 2 * PAD) / 3;
  const colW = W / 7;
  const x = (i: number) => (i + 0.5) * colW;
  const lineY = (j: number) => PAD + j * gap;
  // A towel is most of its column, with room between towels for the today outline.
  const towel = Math.max(12, Math.min(56, colW - 16));
  // Label rows: a zero-height row at each stripe's y, so the name centres on (or sits above) it.
  const labelRows = labelRowTemplate(LINES.length, PAD, gap);
  // Container query in rem (so it moves with text size; spelled out so Tailwind sees it): from
  // 21rem up the group names sit left of the plot, below it above each stripe.
  const PLOT = 'col-start-1 w-full max-w-[42.5rem] @min-[21rem]:col-start-2';

  return (
    <div
      role="img"
      aria-label={weekNetworkDescription(days)}
      className={`@container w-full ${className}`}
    >
      {/* Under 21rem the towels fill their columns, so the group names cannot sit beside the
          stripes: they become a legend above the plot instead. */}
      <ul
        aria-hidden="true"
        className="font-display text-small text-ink-soft m-0 mb-3 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 font-semibold @min-[21rem]:hidden"
      >
        {LINES.map((l) => (
          <li key={l.group} className="flex items-center gap-2">
            <span className={`inline-block h-2 w-5 rounded-[1px] ${l.bg}`} />
            <span data-line-name className="leading-none">
              {groups[l.group]}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 justify-start @min-[21rem]:grid-cols-[auto_minmax(0,42.5rem)]">
        <div
          aria-hidden="true"
          className={`font-display text-ui row-start-1 grid grid-cols-7 pb-1 text-center leading-none font-bold ${PLOT}`}
        >
          {days.map((d) => (
            <div
              key={d.date}
              className={
                d.isToday
                  ? 'text-ink decoration-ink underline decoration-2 underline-offset-4'
                  : 'text-thread'
              }
            >
              <span data-week-day-header>
                <span className={`@min-[21rem]:hidden`}>{weekdayAbbr(d.date).charAt(0)}</span>
                {d.isToday ? (
                  <>
                    <span className={`hidden @min-[21rem]:inline @min-[30rem]:hidden`}>
                      {weekdayAbbr(d.date)}
                    </span>
                    <span className="hidden @min-[30rem]:inline">{w.today}</span>
                  </>
                ) : (
                  <span className={`hidden @min-[21rem]:inline`}>{weekdayAbbr(d.date)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <div ref={ref} aria-hidden="true" className={`row-start-2 ${PLOT}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
            {days.map((d, i) => {
              const left = x(i) - towel / 2;
              const top = lineY(0) - 18;
              const height = 3 * gap + 36;
              const empty = dayKind(d) === 'empty';
              return (
                <g key={d.date} data-week-towel={d.date}>
                  <rect
                    x={left}
                    y={top}
                    width={towel}
                    height={height}
                    rx={4}
                    strokeWidth={1.5}
                    className={
                      empty
                        ? 'fill-raised stroke-control [stroke-dasharray:4_3]'
                        : 'fill-raised stroke-ink'
                    }
                  />
                  {LINES.map((l, j) =>
                    d.groups.includes(l.group) ? (
                      <rect
                        key={l.group}
                        data-week-stripe={`${i}:${l.group}`}
                        x={left + 0.75}
                        y={lineY(j) - 9}
                        width={towel - 1.5}
                        height={18}
                        className={l.fill}
                      />
                    ) : (
                      <path
                        key={l.group}
                        d={`M${left + 6} ${lineY(j)} H${left + towel - 6}`}
                        strokeWidth={2}
                        className="stroke-seam [stroke-dasharray:5_4]"
                        fill="none"
                      />
                    ),
                  )}
                  {dayKind(d) === 'loggedNoLine' ? (
                    <circle
                      data-logged-no-line
                      cx={x(i)}
                      cy={top + height / 2}
                      r={4}
                      className="fill-ink"
                    />
                  ) : null}
                  {d.isToday ? (
                    <rect
                      data-today-ring
                      x={left - 5}
                      y={top - 5}
                      width={towel + 10}
                      height={height + 10}
                      rx={7}
                      fill="none"
                      strokeWidth={2.5}
                      className="stroke-ink"
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
        <div
          aria-hidden="true"
          style={{ gridTemplateRows: labelRows }}
          className={`font-display text-small text-ink-soft pointer-events-none col-start-1 row-start-2 hidden font-semibold @min-[21rem]:grid @min-[21rem]:pr-3`}
        >
          {LINES.map((l, j) => (
            <div
              key={l.group}
              style={{ gridRow: 2 * j + 2 }}
              className="col-start-1 flex h-0 items-center"
            >
              <span data-line-name className="leading-none">
                {groups[l.group]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface DayListProps {
  readonly days: readonly WeekDayData[];
  /** When given, every day is a button that selects it (the week screen). Otherwise rows are plain. */
  readonly onSelectDay?: (date: EpochMs) => void;
  readonly className?: string;
}

/** Day by day: four stripes (a dashed seam when the group was absent) and the plate count. */
export function DayList({ days, onSelectDay, className = '' }: DayListProps) {
  const w = useStrings().week;
  return (
    // One grid for every row (each row a subgrid): the day column is as wide as its widest
    // label ("AUJOURD’HUI" in French) and at least 4rem, and the bars stay aligned across rows.
    // Without subgrid support each row falls back to the fixed 4rem label column.
    <ul
      className={`border-ink m-0 grid list-none grid-cols-[minmax(4rem,max-content)_minmax(0,1fr)_auto] gap-x-3 border-t-2 p-0 ${className}`}
    >
      {days.map((d) => {
        const row = (
          <>
            {/* First child: an absolutely positioned sr-only box is placed at its static position,
                and anywhere else it would sit past the right edge and add page scroll. */}
            <span className="sr-only">
              {dayDescription(d.isToday ? w.today : weekdayName(d.date), describeDay(d))}
            </span>
            <span className="font-display text-subtitle font-bold">
              {d.isToday ? w.today : weekdayAbbr(d.date)}
            </span>
            <span className="flex gap-1">
              {LINES.map((l) => (
                <i
                  key={l.group}
                  aria-hidden="true"
                  className={`block h-2 w-7 min-w-0 rounded-[1px] ${d.groups.includes(l.group) ? l.bg : dayKind(d) === 'loggedNoLine' ? 'border-ink border-[1.5px] border-dashed' : 'border-control border-[1.5px] border-dashed'}`}
                />
              ))}
            </span>
            <span className="text-thread text-meta">{platesCount(d.plateCount)}</span>
          </>
        );
        return (
          <li
            key={d.date}
            className="border-seam col-span-3 grid grid-cols-[4rem_minmax(0,1fr)_auto] supports-[grid-template-columns:subgrid]:grid-cols-subgrid border-b"
          >
            {onSelectDay ? (
              <button
                type="button"
                aria-current={d.isToday ? 'date' : undefined}
                onClick={() => onSelectDay(d.date)}
                className="col-span-3 grid min-h-14 w-full cursor-pointer grid-cols-[4rem_minmax(0,1fr)_auto] supports-[grid-template-columns:subgrid]:grid-cols-subgrid items-center bg-transparent text-left"
              >
                {row}
              </button>
            ) : (
              <div className="col-span-3 grid min-h-14 w-full grid-cols-[4rem_minmax(0,1fr)_auto] supports-[grid-template-columns:subgrid]:grid-cols-subgrid items-center">
                {row}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface WeekNoteTextProps {
  readonly lead: string;
  readonly detail: string;
  readonly className?: string;
}

/** The observation paragraph: bold lead, quiet detail, held to 40ch. */
export function WeekNoteText({ lead, detail, className = '' }: WeekNoteTextProps) {
  return (
    <p className={`text-ink-soft m-0 max-w-[40ch] text-lead ${className}`}>
      <b className="text-ink font-semibold">{lead}</b>
      {detail ? ' ' : null}
      {detail}
    </p>
  );
}

export function NoStreaksLine({ className = '' }: { readonly className?: string }) {
  const w = useStrings().week;
  return <p className={`text-thread m-0 text-meta ${className}`}>{w.noStreaks}</p>;
}
