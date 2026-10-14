import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FoodGroup, PlateLog } from '@anc/core';
import './day.css';
import { useStrings } from '../../i18n';
import { LINES, groupsOfPlate, lineDef, orderedGroups } from '../primitives';
import { usePrefersReducedMotion } from './hooks';

export type StationStatus = 'logged' | 'open' | 'resolving';

export interface LineMapStation {
  readonly id: string;
  readonly status: StationStatus;
  /** The logged plate; its stopped lines are derived from it. Preferred over `groups`. */
  readonly plate?: PlateLog;
  /** Groups that stopped here, when there is no plate to derive them from. */
  readonly groups?: readonly FoodGroup[];
}

/** Groups that stopped at a station, in line order. Ignored unless `status` is `logged`. */
const stoppedGroups = (s: LineMapStation) =>
  s.plate ? groupsOfPlate(s.plate) : orderedGroups(s.groups ?? []);

export interface LineMapProps {
  readonly stations: readonly LineMapStation[];
  /** Renders the text beside a station. Mark the element the station sits on `data-station-anchor`. */
  readonly renderStation: (station: LineMapStation) => ReactNode;
  readonly className?: string;
}

const LANE = 132;
const FALLBACK_ROW = 140;
const FALLBACK_TOP = 8;

interface Geometry {
  readonly ys: readonly number[];
  readonly height: number;
}

function fallbackGeometry(count: number): Geometry {
  return {
    ys: Array.from({ length: count }, (_, i) => FALLBACK_TOP + i * FALLBACK_ROW + 32),
    height: FALLBACK_TOP + count * FALLBACK_ROW,
  };
}

const sameGeometry = (a: Geometry, b: Geometry): boolean =>
  a.height === b.height && a.ys.length === b.ys.length && a.ys.every((y, i) => y === b.ys[i]);

/**
 * Four vertical food-group lines with a station per meal. Stations are positioned from the
 * measured rows (ResizeObserver); where layout is unavailable (jsdom) fixed rows are used.
 * The SVG is decorative: each station row carries its own accessible name.
 */
export function LineMap({ stations, renderStation, className = '' }: LineMapProps) {
  const copy = useStrings().day;
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const reduced = usePrefersReducedMotion();
  const [geometry, setGeometry] = useState<Geometry>(() => fallbackGeometry(stations.length));

  // Arrival: a station that was resolving and is now logged draws in once.
  const statusKey = stations.map((s) => `${s.id}:${s.status}`).join('|');
  const [prev, setPrev] = useState<{ key: string; status: Record<string, StationStatus> }>(() => ({
    key: statusKey,
    status: Object.fromEntries(stations.map((s) => [s.id, s.status])),
  }));
  const [arrived, setArrived] = useState<readonly string[]>([]);
  if (prev.key !== statusKey) {
    const now = Object.fromEntries(stations.map((s) => [s.id, s.status]));
    setPrev({ key: statusKey, status: now });
    setArrived(
      stations
        .filter((s) => s.status === 'logged' && prev.status[s.id] === 'resolving')
        .map((s) => s.id),
    );
  }

  const count = stations.length;
  useLayoutEffect(() => {
    const container = containerRef.current;
    const list = listRef.current;
    if (!container || !list) return;
    const measure = () => {
      const rows = Array.from(list.children) as HTMLElement[];
      const measured = rows.map((row) => {
        const anchor = row.querySelector<HTMLElement>('[data-station-anchor]');
        return row.offsetTop + (anchor ? anchor.offsetTop + anchor.offsetHeight / 2 : 14);
      });
      const height = container.offsetHeight;
      // No layout engine (jsdom) or nothing laid out yet: keep the fixed rows.
      const next =
        height > 0 && measured.some((y) => y > 0)
          ? { ys: measured, height }
          : fallbackGeometry(count);
      setGeometry((cur) => (sameGeometry(cur, next) ? cur : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    for (const row of Array.from(list.children)) ro.observe(row);
    let disposed = false;
    void document.fonts?.ready?.then(() => {
      if (!disposed) measure();
    });
    return () => {
      disposed = true;
      ro.disconnect();
    };
  }, [count, statusKey]);

  const { ys, height } = geometry;
  const arriving = !reduced && arrived.length > 0;

  return (
    <div ref={containerRef} className={`relative pt-2 pr-4 ${className}`}>
      <svg
        aria-hidden="true"
        focusable="false"
        data-testid="line-map-svg"
        className={`pointer-events-none absolute top-0 left-0 overflow-visible ${arriving ? 'day-arrive' : ''}`}
        width={LANE}
        height={height}
        viewBox={`0 0 ${LANE} ${height}`}
      >
        {/* Station capsules first, so the lines run over them. */}
        {stations.map((s, i) => {
          const y = ys[i] ?? 0;
          if (s.status !== 'logged') {
            return (
              <rect
                key={s.id}
                data-station={s.id}
                data-state={s.status}
                x={16}
                y={y - 14}
                width={100}
                height={28}
                rx={14}
                className="fill-enamel stroke-porcelain [stroke-dasharray:6_5]"
                strokeWidth={3}
              />
            );
          }
          const drawing = arriving && arrived.includes(s.id);
          return (
            <rect
              key={s.id}
              data-station={s.id}
              data-state="logged"
              className={`fill-porcelain stroke-porcelain ${drawing ? 'day-ring-draw' : ''}`}
              x={18}
              y={y - 8}
              width={96}
              height={16}
              rx={8}
              strokeWidth={2}
            />
          );
        })}
        {LINES.map((l) => (
          <path
            key={l.group}
            data-line={l.group}
            d={`M${l.x} 0 V${height}`}
            className={l.stroke}
            strokeWidth={8}
            fill="none"
          />
        ))}
        {stations.map((s, i) => {
          if (s.status !== 'logged') return null;
          const y = ys[i] ?? 0;
          const drawing = arriving && arrived.includes(s.id);
          return stoppedGroups(s).map((g, n) => {
            const line = lineDef(g);
            return (
              <circle
                key={`${s.id}-${g}`}
                data-stop={`${s.id}:${g}`}
                className="day-stopdot fill-porcelain stroke-enamel"
                style={drawing ? { animationDelay: `${200 + 60 * n}ms` } : undefined}
                cx={line.x}
                cy={y}
                r={10}
                strokeWidth={3.5}
              />
            );
          });
        })}
      </svg>
      <ol
        ref={listRef}
        aria-label={copy.mapDescription}
        className="m-0 ml-[132px] flex list-none flex-col p-0"
      >
        {stations.map((s) => (
          <li
            key={s.id}
            data-station-row={s.id}
            className="relative min-h-30 pt-[18px] pb-[22px] lg:min-h-35"
          >
            {renderStation(s)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Text legend for the four lines: colour is never the only signal. */
export function LineLegend({ className = '' }: { readonly className?: string }) {
  const { groups } = useStrings();
  return (
    <ul
      aria-hidden="true"
      className={`m-0 flex list-none flex-wrap gap-x-3 gap-y-1.5 px-4 pt-3.5 pb-1 ${className}`}
    >
      {LINES.map((l) => (
        <li key={l.group} className="font-display text-label flex items-center gap-1.5 uppercase">
          <span className={`inline-block h-1.5 w-4 ${l.bg}`} />
          {groups[l.nameKey]}
        </li>
      ))}
    </ul>
  );
}
