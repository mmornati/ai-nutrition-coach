/**
 * Reads a model's reply as a list of recognised foods. Shared by the photo path and "Describe a
 * meal": both ask for the SAME JSON array of `{name, quantityHint, grams, per100g, group,
 * confidence}` and get the SAME untrusted answer back. `group` is validated against the closed
 * enum (a missing or unknown value falls back to the classifier on the cleaned name, never to a
 * guess); at most 20 entries are kept and every string is cleaned and capped at 100 characters.
 * Pure: no I/O.
 */
import {
  isValidGrams,
  parseFoodGroup,
  sanitizeNutrients,
  type FoodGroup,
  type RecognizedFood,
} from '@anc/core';
import type { ByokOutcome, ClassifyFoodGroup } from './types';

/** At most this many foods are kept from one model response. */
export const MAX_RECOGNIZED_FOODS = 20;
/** Longest food name / quantity hint kept (characters). */
export const MAX_FOOD_TEXT_LENGTH = 100;
/** Used when the model gave no usable confidence for a food. */
const DEFAULT_CONFIDENCE = 0.5;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Control characters become spaces, whitespace runs collapse, the result is capped. */
function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  const points = Array.from(cleaned);
  return points.length <= MAX_FOOD_TEXT_LENGTH
    ? cleaned
    : points.slice(0, MAX_FOOD_TEXT_LENGTH).join('').trim();
}

/** A model's weight guess: a valid number of grams (a numeric string is read), else absent. */
function parseGramsEstimate(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return isValidGrams(n) ? n : undefined;
}

/** A model's own confidence: finite, clamped to 0..1; 0.5 ("maybe") when absent or unusable. */
function parseConfidence(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_CONFIDENCE;
  return Math.min(1, Math.max(0, n));
}

export function parseRecognizedFoods(
  text: string,
  options: {
    readonly classifyFoodGroup: ClassifyFoodGroup;
    /** Prefix of each food's `sourceRef` (the food's own name follows it). */
    readonly sourceRefPrefix: string;
  },
): ByokOutcome {
  const jsonText = text
    .trim()
    // Strip a leading/trailing markdown fence if the model added one despite the prompt.
    .replace(/^```(?:json)?\s*|\s*```$/gm, '')
    .trim();
  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonText);
  } catch {
    // Some models wrap the array in prose: try the outer `[` ... `]` slice as a last resort.
    const start = jsonText.indexOf('[');
    const end = jsonText.lastIndexOf(']');
    if (start < 0 || end <= start) return { kind: 'noMatch' };
    try {
      decoded = JSON.parse(jsonText.slice(start, end + 1));
    } catch {
      return { kind: 'noMatch' };
    }
  }
  if (!Array.isArray(decoded) || decoded.length === 0) return { kind: 'noMatch' };
  const foods: RecognizedFood[] = [];
  for (const entry of decoded as unknown[]) {
    if (foods.length >= MAX_RECOGNIZED_FOODS) break;
    if (!isRecord(entry)) continue;
    const name = cleanText(entry.name);
    const hint = cleanText(entry.quantityHint);
    if (name === null) continue;
    const group: FoodGroup = parseFoodGroup(entry.group) ?? options.classifyFoodGroup(name);
    const grams = parseGramsEstimate(entry.grams);
    const nutrients = sanitizeNutrients(entry.per100g);
    foods.push({
      databaseFood: {
        sourceRef: `${options.sourceRefPrefix}${name}`,
        displayName: name,
        source: 'manual',
        foodGroup: group,
        // The model's per-100 g values are a guess; a confident catalogue match replaces them.
        ...(nutrients === undefined
          ? {}
          : { nutrientsPer100g: nutrients, extra: { nutrientsEstimated: true } }),
      },
      confidence: parseConfidence(entry.confidence),
      quantity: {
        low: 1,
        high: 1,
        unit: hint ?? 'serving',
        displayLabel: hint ?? '1 serving',
        // The model's weight is a guess, and says so.
        ...(grams === undefined ? {} : { grams, gramsEstimated: true }),
      },
    });
  }
  return foods.length === 0 ? { kind: 'noMatch' } : { kind: 'recognized', foods };
}
