import { useRef } from 'react';
import { strings, useStrings } from '../../i18n';
import { dayDescription, platesCount } from '../../i18n/sentences';
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
  return `${w.networkIntro} ${days
    .map((d) => `${dayDescription(d.isToday ? w.today : weekdayName(d.date), describeDay(d))}.`)
    .join(' ')}`;
}

/** Four lines across seven days: a stop where the line served the day, a dashed hollow where not. */
export function WeekNetwork({ days, compact = false, className = '' }: WeekNetworkProps) {
  const { week: w, groups } = useStrings();
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(ref, 360);
  const W = Math.min(Math.max(measured, 320), 680);
  const H = compact ? 300 : 320;
  const padL = W < 480 ? 84 : 92;
  const top = 36;
  const gap = (H - top - 30) / 3;
  const colW = (W - padL - 24) / 6;
  const x = (i: number) => padL + i * colW;

  return (
    <div ref={ref} className={`w-full ${className}`}>
      <svg
        role="img"
        aria-label={weekNetworkDescription(days)}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block h-auto w-full"
      >
        {days.map((d, i) => (
          <text
            key={`h-${d.date}`}
            x={x(i)}
            y={20}
            textAnchor="middle"
            className={`font-display text-[16px] font-bold tracking-[1.5px] uppercase ${d.isToday ? 'fill-line-starch' : 'fill-signal-muted'}`}
          >
            {d.isToday ? w.today : weekdayAbbr(d.date)}
          </text>
        ))}
        {days.map((d, i) =>
          dayKind(d) === 'loggedNoLine' ? (
            <path
              key={`l-${d.date}`}
              data-logged-no-line
              d={`M${x(i)} ${top + 10} V${top + 3 * gap + 10}`}
              className="stroke-porcelain"
              strokeWidth={2}
              fill="none"
            />
          ) : null,
        )}
        {LINES.map((l, j) => {
          const y = top + j * gap + 10;
          const x0 = x(0);
          const x1 = x(6);
          return (
            <g key={l.group}>
              <text
                x={0}
                y={y + 5}
                className="font-display fill-porcelain-dim text-[14px] font-semibold tracking-[1px] uppercase"
              >
                {groups[l.nameKey]}
              </text>
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
              x={x(i) - 16}
              y={top - 4}
              width={32}
              height={3 * gap + 28}
              rx={16}
              fill="none"
              strokeWidth={2.5}
              className="stroke-line-starch"
            />
          ) : null,
        )}
      </svg>
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
          className="border-rule grid min-h-14 grid-cols-[64px_1fr_auto] items-center gap-3 border-b"
        >
          <span className="font-display text-[20px] font-bold tracking-[0.06em] uppercase">
            {d.isToday ? w.today : weekdayAbbr(d.date)}
          </span>
          <span className="flex gap-1">
            {LINES.map((l) => (
              <i
                key={l.group}
                aria-hidden="true"
                className={`block h-1.5 w-7 ${d.groups.includes(l.group) ? l.bg : dayKind(d) === 'loggedNoLine' ? 'border-porcelain border-[1.5px] border-dashed' : 'border-rule border-[1.5px] border-dashed'}`}
              />
            ))}
            <span className="sr-only">{dayDescription(weekdayName(d.date), describeDay(d))}</span>
          </span>
          <span className="text-signal-muted text-[14.5px]">{platesCount(d.plateCount)}</span>
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
    <p className={`text-porcelain-dim m-0 max-w-[40ch] text-[17px] ${className}`}>
      <b className="text-porcelain font-semibold">{lead}</b>
      {detail ? ` ${detail}` : null}
    </p>
  );
}

export function NoStreaksLine({ className = '' }: { readonly className?: string }) {
  const w = useStrings().week;
  return <p className={`text-signal-muted m-0 text-[14.5px] ${className}`}>{w.noStreaks}</p>;
}
