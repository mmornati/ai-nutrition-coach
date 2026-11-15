import type { TrendPoint, UnitSystem, WeighIn } from '@anc/core';
import { useId, useState } from 'react';
import { Button } from '../../components/primitives';
import { fill, useLocale, useStrings } from '../../i18n';
import type { Locale } from '../../i18n/locale';
import { formatDay } from '../settings/ProfileBodySection';
import {
  CHART,
  GAP_DAYS,
  LONG_RANGE_DAYS,
  TABLE_ROWS,
  fraction,
  minSpanFor,
  segmentPath,
  thinWeekly,
  weekTicks,
  xDomain,
  yAxisFor,
  type RangeKey,
} from './chart-model';
import { weightText, weightValue } from './weight-format';

const { width: W, height: H, left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM } = CHART;
const FONT = CHART.fontPx;

const dayLabel = (n: number, locale: Locale): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'utc' }).format(
    new Date(n * 86_400_000),
  );

/**
 * The weight chart: the trend as one ink line, the weigh-ins as faint dots, a vertical axis scaled
 * to the data (never a span narrower than 4 kg or 5 % of the body weight) and ticks by the week.
 * Dependency-free inline SVG, one neutral ink, no fill, no goal line, no animation. A line across a
 * gap of two weeks or more is dashed. Labels are 12 px or more at 336 px wide, the last tick label
 * ends at the edge instead of running past it, and a range longer than 180 days is drawn with one
 * dot a week. Weigh-ins the trend leaves out (`ignored`) are not drawn and do not set the axis; the
 * table lists them, marked. The drawing is one image with a name; the summary sentence above it
 * and the table below say the same in text (docs/accessibility.md).
 */
export function TrendChart({
  points,
  units,
  range,
  todayNumber,
  summaryId,
  ignored = [],
}: {
  readonly points: readonly TrendPoint[];
  /** Weigh-ins in the range that the trend leaves out as typing slips. */
  readonly ignored?: readonly WeighIn[];
  readonly units: UnitSystem;
  readonly range: RangeKey;
  readonly todayNumber: number;
  /** The id of the visible sentence that says what the chart shows. */
  readonly summaryId: string;
}) {
  const all = useStrings();
  const s = all.progress;
  const { locale } = useLocale();
  const tableId = useId();
  const [showAllRows, setShowAllRows] = useState(false);
  const x = xDomain(points, range, todayNumber);
  const long = x.to - x.from > LONG_RANGE_DAYS;
  const drawn = long ? thinWeekly(points) : points;
  const display = points.flatMap((p) => [weightValue(p.value, units), weightValue(p.trend, units)]);
  const axis = yAxisFor(display, minSpanFor(display, weightValue(1, units)));
  const px = (n: number) => LEFT + fraction(n, x.from, x.to) * (W - LEFT - RIGHT);
  const py = (v: number) => TOP + (1 - fraction(v, axis.min, axis.max)) * (H - TOP - BOTTOM);
  const ticks = weekTicks(x.from, x.to);
  const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  const segments = drawn.slice(1).map((p, i) => {
    const a = drawn[i] as TrendPoint;
    return {
      key: p.day,
      d: segmentPath(
        px(a.dayNumber),
        py(weightValue(a.trend, units)),
        px(p.dayNumber),
        py(weightValue(p.trend, units)),
      ),
      gap: p.dayNumber - a.dayNumber >= GAP_DAYS,
    };
  });

  // Newest first; a weigh-in the trend leaves out is listed, marked, with no trend value.
  const rows: { readonly day: string; readonly value: number; readonly trend: number | null }[] = [
    ...points.map((p) => ({ day: p.day, value: p.value, trend: p.trend })),
    ...ignored.map((w) => ({ day: w.day, value: w.value, trend: null })),
  ].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const shownRows = showAllRows ? rows : rows.slice(0, TABLE_ROWS);

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={s.chartLabel}
        aria-describedby={summaryId}
        focusable="false"
        className="text-ink h-auto w-full max-w-xl"
      >
        {axis.ticks.map((t) => (
          <g key={t}>
            <line
              x1={LEFT}
              x2={W - RIGHT}
              y1={py(t)}
              y2={py(t)}
              className="stroke-seam"
              strokeWidth={1}
            />
            <text
              x={LEFT - 6}
              y={py(t)}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-ink-soft"
              fontSize={FONT}
            >
              {numberFormat.format(t)}
            </text>
          </g>
        ))}
        {ticks.map((n) => (
          <g key={n}>
            <line
              x1={px(n)}
              x2={px(n)}
              y1={H - BOTTOM}
              y2={H - BOTTOM + 4}
              className="stroke-control"
              strokeWidth={1}
            />
            <text
              x={px(n)}
              y={H - BOTTOM + 18}
              textAnchor={n === x.to ? 'end' : 'middle'}
              className="fill-ink-soft"
              fontSize={FONT}
            >
              {dayLabel(n, locale)}
            </text>
          </g>
        ))}
        {drawn.map((p) => (
          <circle
            key={p.day}
            cx={px(p.dayNumber)}
            cy={py(weightValue(p.value, units))}
            r={2.75}
            className="fill-ink"
            fillOpacity={0.3}
          />
        ))}
        {segments.map((seg) => (
          <path
            key={seg.key}
            d={seg.d}
            fill="none"
            className="stroke-ink"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...(seg.gap ? { strokeDasharray: '2 5' } : {})}
          />
        ))}
        {drawn.length === 1 && drawn[0] !== undefined && (
          <circle
            cx={px(drawn[0].dayNumber)}
            cy={py(weightValue(drawn[0].trend, units))}
            r={3.5}
            className="fill-ink"
          />
        )}
      </svg>
      <p className="text-body-small text-ink-soft">
        {s.legend} {s.xAxisWeeks}
      </p>
      <details className="group text-body-small text-ink-soft">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="border-ink-soft size-2 shrink-0 -rotate-45 border-r-2 border-b-2 transition-transform group-open:rotate-45"
          />
          <span>{s.tableSummary}</span>
        </summary>
        <table id={tableId} className="text-ink mb-2 w-full text-left text-body-small">
          <caption className="text-ink-soft py-1 text-left">{s.tableCaption}</caption>
          <thead>
            <tr className="border-ink border-b-2">
              <th scope="col" className="py-1 pr-3 font-semibold">
                {s.colDay}
              </th>
              <th scope="col" className="py-1 pr-3 font-semibold">
                {s.colWeighIn}
              </th>
              <th scope="col" className="py-1 font-semibold">
                {s.colTrend}
              </th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.day} className="border-seam border-b">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {formatDay(r.day, locale)}
                </th>
                <td className="py-1 pr-3">
                  {weightText(r.value, units, locale, all.profile)}
                  {r.trend === null ? ` (${s.notUsed})` : ''}
                </td>
                <td className="py-1">
                  {r.trend === null ? '' : weightText(r.trend, units, locale, all.profile)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > TABLE_ROWS && (
          <div className="flex flex-col items-start gap-1 pb-2">
            {!showAllRows && (
              <p className="text-body-small text-ink-soft">
                {fill(s.tableCapped, { count: TABLE_ROWS })}
              </p>
            )}
            <Button variant="secondary" onClick={() => setShowAllRows((v) => !v)}>
              {showAllRows ? s.showFewer : fill(s.showAll, { count: rows.length })}
            </Button>
          </div>
        )}
      </details>
    </div>
  );
}
