import { useEffect, useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import type { MealSlot, PlateLog, SyncOpStatusValue } from '@anc/core';
import { useStrings } from '../../i18n';
import {
  lineNames,
  passedThrough,
  removePlateFor,
  dismissHint,
  slotName,
  stationLabel,
} from '../../i18n/sentences';
import { Button, groupsOfPlate, passedGroups } from '../primitives';
import { formatTime } from './format';
import { StatusChip } from './StatusChip';

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

const NAME_CLASS =
  'font-display text-headline lg:text-headline-desktop m-0 flex flex-wrap items-center gap-x-2.5 [overflow-wrap:anywhere] uppercase';

export interface PlateRowProps {
  readonly plate: PlateLog;
  readonly slot: MealSlot;
  /** Core per-plate sync rollup. */
  readonly syncStatus?: SyncOpStatusValue | null;
  /** Whether a sync transport exists; without one the chip only says "On this device". */
  readonly hasTransport?: boolean;
  /** Tap: open the plate detail. */
  readonly onOpen: (plateId: number) => void;
  /** Press-and-hold (500ms) or the "Remove this plate" action: the parent shows a calm confirm. */
  readonly onRequestDelete: (plateId: number) => void;
  /** Coach card or depth panel, rendered under the row. */
  readonly children?: ReactNode;
}

/** A logged station: name, time, entries, which lines passed through, status. */
export function PlateRow({
  plate,
  slot,
  syncStatus = null,
  hasTransport = false,
  onOpen,
  onRequestDelete,
  children,
}: PlateRowProps) {
  const s = useStrings().day;
  const present = groupsOfPlate(plate);
  const passed = passedGroups(present);
  const meal = slotName(slot);
  const time = formatTime(plate.loggedAtUtc);
  const summary = plate.entries.map((e) => e.databaseFood.displayName).join(', ');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => cancel, []);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button > 0) return;
    held.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      held.current = true;
      onRequestDelete(plate.id);
    }, HOLD_MS);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const o = origin.current;
    if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE) cancel();
  };

  const stopsText =
    present.length === 4
      ? s.allStopped
      : present.length === 0
        ? s.noneStopped
        : passedThrough(lineNames(passed));

  return (
    <>
      <h2 data-station-anchor className={NAME_CLASS}>
        {meal}
        <span className="font-display text-signal-muted text-aside font-semibold tracking-[0.06em]">
          {time}
        </span>
      </h2>
      <p className="text-signal-muted text-body-small mt-1">{summary}</p>
      <p className="text-porcelain-dim mt-1.5 text-meta">{stopsText}</p>
      <div className="mt-2">
        <StatusChip hasTransport={hasTransport} status={syncStatus} />
      </div>
      <button
        type="button"
        data-testid={`open-plate-${plate.id}`}
        aria-label={stationLabel({
          meal,
          time,
          present: lineNames(present),
          passed: lineNames(passed),
        })}
        className="absolute inset-0 min-h-12 w-full cursor-pointer touch-manipulation bg-transparent select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          if (held.current || timer.current !== null) e.preventDefault();
        }}
        onClick={(e) => {
          if (held.current) {
            // The hold already opened the confirm; swallow the click that follows release.
            held.current = false;
            e.preventDefault();
            return;
          }
          onOpen(plate.id);
        }}
      />
      <Button
        variant="framed-enamel"
        onClick={() => onRequestDelete(plate.id)}
        className="sr-only z-20 focus:not-sr-only focus:absolute focus:top-2 focus:right-0"
      >
        {removePlateFor(meal, time)}
      </Button>
      {children}
    </>
  );
}

export interface OpenStationProps {
  readonly slot: MealSlot;
  /** A coach hint for this open slot. Tapping it dismisses it durably (the parent persists). */
  readonly hint?: string | null;
  readonly onDismissHint?: () => void;
  /** A plate is being read: dashed station plus a static line, no spinner. */
  readonly resolving?: boolean;
}

/** An open station: dashed, quiet. A hint is a single tap target, never sure / ask later. */
export function OpenStation({ slot, hint, onDismissHint, resolving = false }: OpenStationProps) {
  const s = useStrings().day;
  const meal = slotName(slot);
  return (
    <>
      <h2 data-station-anchor className={NAME_CLASS}>
        {meal}
      </h2>
      {resolving ? (
        <p
          role="status"
          className="font-display text-line-starch mt-1.5 text-aside font-semibold tracking-[0.1em]"
        >
          {s.reading}
        </p>
      ) : hint ? (
        <button
          type="button"
          onClick={onDismissHint}
          aria-label={dismissHint(hint)}
          className="text-porcelain-dim mt-1.5 min-h-12 max-w-[34ch] cursor-pointer bg-transparent py-1 text-left text-hint"
        >
          {hint}
        </button>
      ) : (
        <p className="text-porcelain-dim mt-1.5 max-w-[34ch] text-hint">{s.openQuietPlace}</p>
      )}
    </>
  );
}
