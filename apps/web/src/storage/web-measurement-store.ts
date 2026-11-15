// The web `MeasurementStore`: the person's dated weigh-ins and waist measurements (schema v5,
// docs/adr/0008), a thin view over the controller's open database. While the store is locked every
// call answers a typed `locked` failure; nothing throws across the port. Values are validated and
// rounded here (two decimals for a weight in kg, one for a waist in cm); one measurement per kind and local day (a second the same day
// replaces the first, with a fresh stamp so the change syncs).

import {
  isCalendarDayText,
  isMeasurementKind,
  isValidMeasurementValue,
  localDayText,
  measurementFailed,
  measurementOk,
  measurementValueText,
  roundMeasurementFor,
  type BodyMeasurement,
  type EpochMs,
  type MeasurementKind,
  type MeasurementResult,
  type MeasurementStore,
  type NewBodyMeasurement,
} from '@anc/core';
import type { ChangeBus } from './change-bus';
import { isProgrammingError, SessionClosedError } from './errors';
import type { MeasurementRow } from './ops';
import { parseStoredInstant, toStoredInstant } from './row-mapping';
import type { StoreSource } from './store-source';

function toMeasurement(row: MeasurementRow): BodyMeasurement | null {
  const at = parseStoredInstant(row.measuredAtUtc);
  const value = Number(row.value);
  if (at === null || !isMeasurementKind(row.kind) || !Number.isFinite(value)) return null;
  return { kind: row.kind, day: row.day, measuredAtUtc: at, value };
}

export class WebMeasurementStore implements MeasurementStore {
  constructor(
    private readonly source: StoreSource,
    private readonly bus: ChangeBus,
    private readonly options: { now?: () => EpochMs } = {},
  ) {}

  private async run<T>(
    work: (db: NonNullable<ReturnType<StoreSource['database']>>) => Promise<MeasurementResult<T>>,
  ): Promise<MeasurementResult<T>> {
    const db = this.source.database();
    if (!db) return measurementFailed('locked');
    try {
      return await work(db);
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return measurementFailed(error instanceof SessionClosedError ? 'locked' : 'storeOperation');
    }
  }

  list(kind?: MeasurementKind): Promise<MeasurementResult<readonly BodyMeasurement[]>> {
    return this.run(async (db) => {
      const rows = await db.readMeasurements();
      const list = rows
        .map(toMeasurement)
        .filter((m): m is BodyMeasurement => m !== null && (kind === undefined || m.kind === kind));
      return measurementOk(list);
    });
  }

  record(input: NewBodyMeasurement): Promise<MeasurementResult<BodyMeasurement>> {
    const now = Math.floor((this.options.now ?? Date.now)());
    const measuredAtUtc = Math.floor(input.measuredAtUtc);
    const day = input.day ?? localDayText(measuredAtUtc);
    if (
      !isMeasurementKind(input.kind) ||
      !Number.isFinite(measuredAtUtc) ||
      !isCalendarDayText(day) ||
      !isValidMeasurementValue(input.kind, input.value) ||
      measuredAtUtc > now + 24 * 3_600_000
    ) {
      return Promise.resolve(measurementFailed('invalid'));
    }
    const value = roundMeasurementFor(input.kind, input.value);
    if (!isValidMeasurementValue(input.kind, value)) {
      return Promise.resolve(measurementFailed('invalid'));
    }
    return this.run(async (db) => {
      await db.upsertMeasurement(
        input.kind,
        day,
        toStoredInstant(measuredAtUtc),
        measurementValueText(input.kind, value),
      );
      this.bus.emit('measurements');
      return measurementOk({ kind: input.kind, day, measuredAtUtc, value });
    });
  }

  remove(kind: MeasurementKind, day: string): Promise<MeasurementResult<null>> {
    if (!isMeasurementKind(kind) || !isCalendarDayText(day)) {
      return Promise.resolve(measurementFailed('invalid'));
    }
    return this.run(async (db) => {
      await db.deleteMeasurement(kind, day);
      this.bus.emit('measurements');
      return measurementOk(null);
    });
  }
}
