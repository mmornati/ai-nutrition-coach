import { useRef } from 'react';
import { strings, useStrings } from '../../i18n';
import { dayDescription, daySentence, networkDescription, platesCount } from '../../i18n/sentences';
import { LINES } from '../primitives';
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

/** Text alternative: every day, by line name. */
export function weekNetworkDescription(days: readonly WeekDayData[]): string {
  const w = strings().week;
  return networkDescription(
    days.map((d) => daySentence(d.isToday ? w.today : weekdayName(d.date), describeDay(d))),
  );
}

/** The plot is drawn in user units; 680 of them are 42.5rem, so the drawing scales with text. */
const MAX_W = 680;
const MIN_W = 140;
/** Height of the plot: 30 units above the first line and below the last, for labels and rings. */
const PAD = 30;

/** Root font size relative to 16px: 2 at 200% text. 1 where layout is not available (jsdom). */
function remScale(): number {
  if (typeof document === 'undefined') return 1;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? px / 16 : 1;
}

/**
 * Four lines across seven days: a stop where the line served the day, a dashed hollow where not.
 *
 * Only the lines and stops are SVG, in user units, so the drawing scales as a whole. Every piece
 * of text (day headers, line names) is HTML laid out by CSS grid, so it reflows with the text
 * size instead of colliding (WCAG 1.4.4). The wording is on the wrapper as one image label.
 */
export function WeekNetwork({ days, compact = false, className = '' }: WeekNetworkProps) {
  const { week: w, groups } = useStrings();
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(ref, 360);
  // Measured in rem-relative units, so the drawing is never scaled up past the text around it.
  const W = Math.min(Math.max(measured / remScale(), MIN_W), MAX_W);
  const H = compact ? 294 : 314;
  const gap = (H - 2 * PAD) / 3;
  const colW = W / 7;
  const x = (i: number) => (i + 0.5) * colW;
  const lineY = (j: number) => PAD + j * gap;
  const ring = Math.min(32, colW - 2);
  // Label rows: a zero-height row at each line's y, so the name centres on (or sits above) it.
  const labelRows = `minmax(0,${PAD}fr) ${LINES.map(
    (_, j) => `0px${j < LINES.length - 1 ? ` minmax(0,${gap}fr)` : ''}`,
  ).join(' ')} minmax(0,${PAD}fr)`;
  // Container query in rem (so it moves with text size; spelled out so Tailwind sees it): from
  // 21rem up the line names sit left of the plot, below it above each line.
  const plot = 'col-start-1 w-full max-w-[42.5rem] @min-[21rem]:col-start-2';

  return (
    <div
      role="img"
      aria-label={weekNetworkDescription(days)}
      className={`@container w-full ${className}`}
    >
      <div className="grid grid-cols-1 justify-start @min-[21rem]:grid-cols-[auto_minmax(0,42.5rem)]">
        <div
          aria-hidden="true"
          className={`font-display text-ui row-start-1 grid grid-cols-7 pb-1 text-center leading-none font-bold tracking-[0.1em] uppercase ${plot}`}
        >
          {days.map((d) => (
            <div key={d.date} className={d.isToday ? 'text-line-starch' : 'text-signal-muted'}>
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
        <div ref={ref} aria-hidden="true" className={`row-start-2 ${plot}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
            {days.map((d, i) =>
              dayKind(d) === 'loggedNoLine' ? (
                <path
                  key={`l-${d.date}`}
                  data-logged-no-line
                  d={`M${x(i)} ${lineY(0)} V${lineY(3)}`}
                  className="stroke-porcelain"
                  strokeWidth={2}
                  fill="none"
                />
              ) : null,
            )}
            {LINES.map((l, j) => {
              const y = lineY(j);
              const x0 = x(0);
              const x1 = x(6);
              return (
                <g key={l.group}>
                  <path d={`M${x0} ${y} H${x1}`} className={l.stroke} strokeWidth={7} fill="none" />
                  <path
                    d={`M${x0} ${y - 9} V${y + 9} M${x1} ${y - 9} V${y + 9}`}
                    className={l.stroke}
                    strokeWidth={5}
                    fill="none"
                  />
                  {days.map((d, i) =>
                    d.groups.includes(l.group) ? (
                      <circle
                        key={d.date}
                        cx={x(i)}
                        cy={y}
                        r={8}
                        strokeWidth={3}
                        className="fill-porcelain stroke-enamel"
                      />
                    ) : (
                      <circle
                        key={d.date}
                        cx={x(i)}
                        cy={y}
                        r={7}
                        strokeWidth={2}
                        className="fill-enamel stroke-signal-muted [stroke-dasharray:3_3]"
                      />
                    ),
                  )}
                </g>
              );
            })}
            {days.map((d, i) =>
              d.isToday ? (
                <rect
                  key={`t-${d.date}`}
                  data-today-ring
                  x={x(i) - ring / 2}
                  y={lineY(0) - 14}
                  width={ring}
                  height={3 * gap + 28}
                  rx={ring / 2}
                  fill="none"
                  strokeWidth={2.5}
                  className="stroke-line-starch"
                />
              ) : null,
            )}
          </svg>
        </div>
        <div
          aria-hidden="true"
          style={{ gridTemplateRows: labelRows }}
          className={`font-display text-small text-porcelain-dim pointer-events-none col-start-1 row-start-2 grid font-semibold tracking-[0.06em] uppercase @min-[21rem]:col-start-1 @min-[21rem]:pr-3`}
        >
          {LINES.map((l, j) => (
            <div
              key={l.group}
              style={{ gridRow: 2 * j + 2 }}
              className={`col-start-1 flex h-0 items-end -translate-y-3 @min-[21rem]:translate-y-0 @min-[21rem]:items-center`}
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
  readonly className?: string;
}

/** Day by day: four line segments (dashed when the line was absent) and the plate count. */
export function DayList({ days, className = '' }: DayListProps) {
  const w = useStrings().week;
  return (
    <ul className={`border-porcelain m-0 list-none border-t-2 p-0 ${className}`}>
      {days.map((d) => (
        <li
          key={d.date}
          className="border-rule grid min-h-14 grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 border-b"
        >
          {/* First child: an absolutely positioned sr-only box is placed at its static position,
              and anywhere else it would sit past the right edge and add page scroll. */}
          <span className="sr-only">
            {dayDescription(d.isToday ? w.today : weekdayName(d.date), describeDay(d))}
          </span>
          <span className="font-display text-subtitle font-bold tracking-[0.06em] uppercase">
            {d.isToday ? w.today : weekdayAbbr(d.date)}
          </span>
          <span className="flex gap-1">
            {LINES.map((l) => (
              <i
                key={l.group}
                aria-hidden="true"
                className={`block h-1.5 w-7 min-w-0 ${d.groups.includes(l.group) ? l.bg : dayKind(d) === 'loggedNoLine' ? 'border-porcelain border-[1.5px] border-dashed' : 'border-signal-muted border-[1.5px] border-dashed'}`}
              />
            ))}
          </span>
          <span className="text-signal-muted text-meta">{platesCount(d.plateCount)}</span>
        </li>
      ))}
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
    <p className={`text-porcelain-dim m-0 max-w-[40ch] text-lead ${className}`}>
      <b className="text-porcelain font-semibold">{lead}</b>
      {detail ? ' ' : null}
      {detail}
    </p>
  );
}

export function NoStreaksLine({ className = '' }: { readonly className?: string }) {
  const w = useStrings().week;
  return <p className={`text-signal-muted m-0 text-meta ${className}`}>{w.noStreaks}</p>;
}
