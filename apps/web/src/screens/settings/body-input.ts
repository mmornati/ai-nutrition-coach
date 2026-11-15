// Typing and showing body measurements (docs/adr/0008). Storage is always SI (kg, cm); the profile's
// `units` only changes the input and the display. A decimal comma is accepted in every language.

import { MEASUREMENT_RANGE, type MeasurementKind, type UnitSystem } from '@anc/core';

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

/** A number typed by a person: digits with one decimal point or comma, nothing else. */
export function parseTypedNumber(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

export const kgToLb = (kg: number): number => oneDecimal(kg / KG_PER_LB);
/** Pounds to kg at two decimals, as a weight is stored, so 150 lb comes back as 150 lb. */
export const lbToKg = (lb: number): number => Math.round(lb * KG_PER_LB * 100) / 100;
export const cmToInches = (cm: number): number => oneDecimal(cm / CM_PER_INCH);
export const inchesToCm = (inches: number): number => oneDecimal(inches * CM_PER_INCH);

/** Inches in a height go from 0 up to, but not including, 12. */
export const MAX_INCHES_PART = 11.9;

/**
 * A height typed or pasted whole into the feet field: `5'11"`, `5' 11`, `5 ft 11`, `5ft11in`, with
 * straight or typographic marks. Returns the feet and inches (a missing inches part is 0), or `null`
 * when the text is just a number or is not a height at all.
 */
export function splitFeetAndInches(
  text: string,
): { readonly feet: string; readonly inches: string } | null {
  const m =
    /^\s*(\d+)\s*(?:'|′|’|ft|feet|foot|pi|pieds?)\s*(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|”|''|in|inch|inches|po|pouces?)?)?\s*$/i.exec(
      text,
    );
  if (m === null) return null;
  return { feet: m[1] as string, inches: m[2] ?? '' };
}

/** Whole feet and inches (one decimal) for a height in cm. */
export function cmToFeetInches(cm: number): { readonly feet: number; readonly inches: number } {
  const total = cm / CM_PER_INCH;
  let feet = Math.floor(total / INCHES_PER_FOOT);
  let inches = oneDecimal(total - feet * INCHES_PER_FOOT);
  if (inches >= INCHES_PER_FOOT) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export const feetInchesToCm = (feet: number, inches: number): number =>
  oneDecimal((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH);

/** The weight in the display system (kg or lb), one decimal. */
export const weightForDisplay = (kg: number, units: UnitSystem): number =>
  units === 'imperial' ? kgToLb(kg) : kg;

/** The waist in the display system (cm or inches), one decimal. */
export const waistForDisplay = (cm: number, units: UnitSystem): number =>
  units === 'imperial' ? cmToInches(cm) : cm;

export type MeasurementParse =
  | { readonly kind: 'ok'; readonly value: number }
  | { readonly kind: 'number'; readonly example: string }
  | {
      readonly kind: 'range';
      readonly min: number;
      readonly max: number;
      readonly unit: 'kg' | 'lb' | 'cm' | 'in';
    };

/**
 * A typed weight or waist, in the person's units, read once for every place that takes one (the
 * Profile's Body section, the weigh-in sheet, the welcome): the value in kg or cm when it is a
 * number in range, else what to tell the person (the example to type, or the accepted range in
 * THEIR units). A decimal comma is accepted.
 */
export function parseMeasurementText(
  kind: MeasurementKind,
  text: string,
  units: UnitSystem,
): MeasurementParse {
  const imperial = units === 'imperial';
  const typed = parseTypedNumber(text);
  if (typed === null) {
    return {
      kind: 'number',
      example: kind === 'weight' ? (imperial ? '154' : '70') : imperial ? '32' : '81',
    };
  }
  const value =
    kind === 'weight' ? (imperial ? lbToKg(typed) : typed) : imperial ? inchesToCm(typed) : typed;
  const { min, max } = MEASUREMENT_RANGE[kind];
  if (value < min || value > max) {
    return kind === 'weight'
      ? imperial
        ? { kind: 'range', min: kgToLb(min), max: kgToLb(max), unit: 'lb' }
        : { kind: 'range', min, max, unit: 'kg' }
      : imperial
        ? { kind: 'range', min: cmToInches(min), max: cmToInches(max), unit: 'in' }
        : { kind: 'range', min, max, unit: 'cm' };
  }
  return { kind: 'ok', value };
}

/**
 * A typed weight that differs from the last known one by more than 10 % or 5 kg (whichever is
 * larger) is asked about once before it is saved: a slip like 182 for 82 is the likely reason.
 */
export const weightNeedsConfirmation = (newKg: number, lastKg: number | undefined): boolean =>
  lastKg !== undefined && Math.abs(newKg - lastKg) > Math.max(lastKg * 0.1, 5);
