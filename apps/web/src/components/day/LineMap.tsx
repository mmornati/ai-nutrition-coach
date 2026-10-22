import { useState } from 'react';
import type { ReactNode } from 'react';
import type { FoodGroup, PlateLog } from '@anc/core';
import './day.css';
import { useStrings } from '../../i18n';
import { LINES, groupsOfPlate, orderedGroups } from '../primitives';
import { usePrefersReducedMotion } from './hooks';

export type StationStatus = 'logged' | 'open' | 'resolving';

export interface LineMapStation {
  readonly id: string;
  readonly status: StationStatus;
  /** The logged plate; its groups are derived from it. Preferred over `groups`. */
  readonly plate?: PlateLog;
  /** Groups on the plate, when there is no plate to derive them from. */
  readonly groups?: readonly FoodGroup[];
}

/** Groups on a plate, in stripe order. Ignored unless `status` is `logged`. */
const stoppedGroups = (s: LineMapStation) =>
  s.plate ? groupsOfPlate(s.plate) : orderedGroups(s.groups ?? []);

export interface LineMapProps {
  readonly stations: readonly LineMapStation[];
  /** Renders the text beside a meal's band. */
  readonly renderStation: (station: LineMapStation) => ReactNode;
  readonly className?: string;
}

/**
 * The day as a kitchen towel: one woven band per meal. Each food group on the plate is a dyed
 * stripe across the band's left field, in fixed order (veg, protein, starch, dairy); a group that
 * is not on the plate leaves bare cotton, drawn as a dashed seam. An open meal is an empty dashed
 * band. The weave is decorative; each band's text carries its own accessible name.
 */
export function LineMap({ stations, renderStation, className = '' }: LineMapProps) {
  const copy = useStrings().day;
  const reduced = usePrefersReducedMotion();

  // Arrival: a band that was resolving and is now logged weaves in once.
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

  return (
    <ol
      aria-label={copy.mapDescription}
      data-testid="day-towel"
      className={`border-seam m-0 flex list-none flex-col border-b p-0 ${className}`}
    >
      {stations.map((s) => {
        const weaving = !reduced && arrived.includes(s.id);
        return (
          <li
            key={s.id}
            data-station-row={s.id}
            className="border-seam relative grid min-h-33 grid-cols-[min(6.5rem,27vw)_minmax(0,1fr)] border-t lg:min-h-36 lg:grid-cols-[8.5rem_minmax(0,1fr)]"
          >
            <Weave station={s} weaving={weaving} />
            <div className="min-w-0 py-4 pr-5 pl-4 lg:pr-7 lg:pl-5">{renderStation(s)}</div>
          </li>
        );
      })}
    </ol>
  );
}

/** One band's weave: four stripe rows, dyed where the group is on the plate. */
function Weave({ station, weaving }: { station: LineMapStation; weaving: boolean }) {
  if (station.status !== 'logged') {
    return (
      <span
        aria-hidden="true"
        data-station={station.id}
        data-state={station.status}
        className={`border-control my-5 block min-h-20 self-start rounded-r-cloth border-2 border-l-0 border-dashed ${
          station.status === 'resolving' ? 'weave-resolving' : ''
        }`}
      />
    );
  }
  const present = new Set(stoppedGroups(station));
  let order = 0;
  return (
    <span
      aria-hidden="true"
      data-station={station.id}
      data-state="logged"
      className={`flex flex-col justify-start gap-1.5 pt-6 pb-5 lg:pt-7 ${weaving ? 'weave-in' : ''}`}
    >
      {LINES.map((l) => {
        const dyed = present.has(l.group);
        const delay = dyed ? 60 * order++ : 0;
        return (
          <span
            key={l.group}
            data-line={l.group}
            data-stop={dyed ? `${station.id}:${l.group}` : undefined}
            className={dyed ? `weave-stripe block h-2.5 ${l.bg}` : 'weave-bare block h-2.5'}
            style={weaving && dyed ? { animationDelay: `${delay}ms` } : undefined}
          />
        );
      })}
    </span>
  );
}

/** Text legend for the four stripes: colour is never the only signal. */
export function LineLegend({ className = '' }: { readonly className?: string }) {
  const { groups } = useStrings();
  return (
    <ul
      aria-hidden="true"
      className={`m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 px-5 pt-1 pb-4 ${className}`}
    >
      {LINES.map((l) => (
        <li key={l.group} className="font-display text-label text-ink-soft flex items-center gap-2">
          <span className={`inline-block h-2 w-5 rounded-[1px] ${l.bg}`} />
          {groups[l.group]}
        </li>
      ))}
    </ul>
  );
}
