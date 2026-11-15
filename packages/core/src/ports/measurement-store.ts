import type {
  BodyMeasurement,
  MeasurementKind,
  NewBodyMeasurement,
} from '../entities/body-measurement';

export type MeasurementFailureReason = 'locked' | 'invalid' | 'storeOperation';

export type MeasurementResult<T> =
  | { readonly kind: 'measurement'; readonly value: T }
  | { readonly kind: 'measurementFailed'; readonly reason: MeasurementFailureReason };

export const measurementOk = <T>(value: T): MeasurementResult<T> => ({
  kind: 'measurement',
  value,
});
export const measurementFailed = (reason: MeasurementFailureReason): MeasurementResult<never> => ({
  kind: 'measurementFailed',
  reason,
});

/**
 * The person's dated body measurements (docs/adr/0008). Same encrypted store as their plates;
 * erased and synced with it. One per calendar day per kind: `record` for a day that has one
 * replaces it. Newest day first.
 */
export interface MeasurementStore {
  list(kind?: MeasurementKind): Promise<MeasurementResult<readonly BodyMeasurement[]>>;
  record(input: NewBodyMeasurement): Promise<MeasurementResult<BodyMeasurement>>;
  /** Idempotent: a day without a measurement succeeds. */
  remove(kind: MeasurementKind, day: string): Promise<MeasurementResult<null>>;
}
