/**
 * A dated body measurement (docs/adr/0008): a weigh-in (kg) or a waist (cm). Optional, encrypted,
 * synced with the vault, exported and erased with everything else. Storage is always SI; the
 * profile's `units` only changes how it is shown and typed.
 *
 * One measurement per calendar day per kind: a second entry the same day replaces the first. That
 * rule is made structural: the uid of a measurement is derived from (kind, local day), so two
 * devices that record the same day's weight talk about the SAME record and the later write wins
 * (last-writer-wins on its stamp), instead of producing two rows a merge would have to pick from.
 */
export const MEASUREMENT_KINDS = ['weight', 'waist'] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

/** Accepted ranges, inclusive (weight in kg, waist in cm). */
export const MEASUREMENT_RANGE = Object.freeze({
  weight: Object.freeze({ min: 20, max: 400 }),
  waist: Object.freeze({ min: 30, max: 250 }),
});

/** Accepted height range in centimetres (profile field). */
export const HEIGHT_RANGE_CM = Object.freeze({ min: 100, max: 250 });

export const isMeasurementKind = (value: unknown): value is MeasurementKind =>
  typeof value === 'string' && (MEASUREMENT_KINDS as readonly string[]).includes(value);

/** Heights and the other derived figures are kept to one decimal: more is noise. */
export function roundMeasurement(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Decimals kept per kind. A weight keeps TWO decimals in kg, so a value typed in pounds
 * (to 0.1 lb, i.e. 0.045 kg) comes back as the same pounds: 150 lb is 68.04 kg is 150 lb. A waist
 * keeps one decimal in cm.
 */
export const MEASUREMENT_DECIMALS = Object.freeze({ weight: 2, waist: 1 });

/** A measurement value rounded the way its kind is stored. */
export function roundMeasurementFor(kind: MeasurementKind, value: number): number {
  const factor = 10 ** MEASUREMENT_DECIMALS[kind];
  return Math.round(value * factor) / factor;
}

export function isValidMeasurementValue(kind: MeasurementKind, value: number): boolean {
  const { min, max } = MEASUREMENT_RANGE[kind];
  return Number.isFinite(value) && value >= min && value <= max;
}

/** The text a store keeps for a value: rounded as its kind is stored, no trailing zeros. */
export const measurementValueText = (kind: MeasurementKind, value: number): string =>
  String(roundMeasurementFor(kind, value));

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `yyyy-MM-dd` and a real calendar date. */
export function isCalendarDayText(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DAY_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** The local calendar day of an instant as `yyyy-MM-dd` (the machine's local time zone). */
export function localDayText(moment: number): string {
  const d = new Date(moment);
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 128 deterministic bits from text (cyrb128): not cryptographic, only a stable identity. */
function hash128(text: string): readonly [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/**
 * The uid of the measurement of `kind` on `day`: a version-8 UUID (RFC 9562, "custom") computed
 * from the two, the same on every device. It is deliberately NOT a v7 uid: it carries no time and
 * is not part of the store's monotonic uid sequence.
 */
export function measurementUid(kind: MeasurementKind, day: string): string {
  const [a, b, c, d] = hash128(`anc.measurement:${kind}:${day}`);
  const hex = (n: number): string => n.toString(16).padStart(8, '0');
  const [w1, w2, w3, w4] = [hex(a), hex(b), hex(c), hex(d)];
  const variant = ((parseInt(w3.slice(0, 1), 16) & 0x3) | 0x8).toString(16);
  return `${w1}-${w2.slice(0, 4)}-8${w2.slice(5, 8)}-${variant}${w3.slice(1, 4)}-${w3.slice(4)}${w4}`;
}

/** One stored measurement as the screens see it. */
export interface BodyMeasurement {
  readonly kind: MeasurementKind;
  /** Local calendar day, `yyyy-MM-dd`. */
  readonly day: string;
  /** The UTC instant it was taken (epoch ms). */
  readonly measuredAtUtc: number;
  /** kg for a weight (two decimals), cm for a waist (one decimal). */
  readonly value: number;
}

export interface NewBodyMeasurement {
  readonly kind: MeasurementKind;
  readonly value: number;
  readonly measuredAtUtc: number;
  /** The local calendar day; defaults to the machine's local day of `measuredAtUtc`. */
  readonly day?: string;
}
