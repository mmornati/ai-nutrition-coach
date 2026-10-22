// Raw rows -> domain values, on the main thread. A corrupt stored row never poisons a read or a
// stream: a plate with an unparseable timestamp and an entry with a non-finite or inverted
// quantity are skipped and reported through the (content-free) reporter.

import {
  foodGroupFromStored,
  frozenList,
  isValidGrams,
  isValidRange,
  sanitizeFoodExtra,
  sanitizeNutrients,
  plateLog,
  SOURCE_CATALOGS,
  type CoachAnchor,
  type CoachNote,
  type EpochMs,
  type FoodEntry,
  type FoodEntryDraft,
  type PlateLog,
  type Recipe,
  type SavedMeal,
  type SourceCatalog,
  COACH_ANCHORS,
} from '@anc/core';
import type { CorruptRowReporter } from './corrupt-row-log';
import type {
  EntryInsert,
  EntryRow,
  NoteRow,
  PlateRowSet,
  RecipeSet,
  SavedItemRow,
  SavedMealSet,
} from './ops';

const ISO_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** UTC ISO-8601 with millisecond precision: fixed width, so text order is instant order. */
export function toStoredInstant(moment: EpochMs): string {
  return new Date(moment).toISOString();
}

/** Strict inverse of `toStoredInstant`; `null` for anything else. */
export function parseStoredInstant(raw: string): EpochMs | null {
  if (!ISO_MILLIS.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** `null` for anything that is not a finite number (NaN, Infinity, garbage, blank). */
function parseFinite(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseSource(raw: string): SourceCatalog {
  return SOURCE_CATALOGS.find((s) => s === raw) ?? 'manual';
}

/** Garbage in the v2 columns never drops a row: the field is simply absent. */
function parseGrams(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const value = parseFinite(raw);
  return value !== null && isValidGrams(value) ? value : undefined;
}

function parseJson(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The food and quantity of a stored entry-shaped row; `null` (reported) when the quantity is corrupt. */
function toDraft(
  row: EntryInsert & { readonly id: number },
  report: CorruptRowReporter,
  what: string,
): FoodEntryDraft | null {
  const low = parseFinite(row.quantityLow);
  const high = parseFinite(row.quantityHigh);
  if (low === null || high === null || !isValidRange(low, high)) {
    report(row.id, `${what}: invalid quantity`);
    return null;
  }
  const grams = parseGrams(row.quantityGrams);
  const nutrientsPer100g = sanitizeNutrients(parseJson(row.nutrientsPer100g));
  const extra = sanitizeFoodExtra(parseJson(row.foodExtra));
  return {
    databaseFood: {
      sourceRef: row.sourceRef,
      displayName: row.displayName,
      source: parseSource(row.source),
      foodGroup: foodGroupFromStored(row.foodGroup),
      ...(nutrientsPer100g ? { nutrientsPer100g } : {}),
      ...(extra ? { extra } : {}),
    },
    quantity: {
      low,
      high,
      unit: row.quantityUnit,
      displayLabel: row.quantityDisplayLabel,
      ...(grams !== undefined
        ? {
            grams,
            ...(row.quantityGramsEstimated !== null && row.quantityGramsEstimated !== undefined
              ? { gramsEstimated: row.quantityGramsEstimated === 1 }
              : {}),
          }
        : {}),
    },
  };
}

function toEntry(row: EntryRow, report: CorruptRowReporter): FoodEntry | null {
  const draft = toDraft(row, report, 'entry');
  return draft === null ? null : { id: row.id, plateLogId: row.plateLogId, ...draft };
}

export function mapPlateRows(set: PlateRowSet, report: CorruptRowReporter): readonly PlateLog[] {
  const byPlate = new Map<number, FoodEntry[]>();
  for (const row of set.entries) {
    const entry = toEntry(row, report);
    if (!entry) continue;
    const bucket = byPlate.get(row.plateLogId);
    if (bucket) bucket.push(entry);
    else byPlate.set(row.plateLogId, [entry]);
  }
  const plates: PlateLog[] = [];
  for (const row of set.plates) {
    const loggedAtUtc = parseStoredInstant(row.loggedAtUtc);
    if (loggedAtUtc === null) {
      report(row.id, 'plate: unparseable timestamp');
      continue;
    }
    plates.push(plateLog({ id: row.id, loggedAtUtc, entries: byPlate.get(row.id) ?? [] }));
  }
  return frozenList(plates);
}

function parseAnchor(raw: string): CoachAnchor {
  // A future anchor the v1 store does not know about must not crash the read path.
  return COACH_ANCHORS.find((a) => a === raw) ?? 'postResolve';
}

/** Notes with an unparseable timestamp are skipped (and reported), never thrown. */
export function mapNoteRows(
  rows: readonly NoteRow[],
  report: CorruptRowReporter,
): readonly CoachNote[] {
  const notes: CoachNote[] = [];
  for (const row of rows) {
    const generatedAt = parseStoredInstant(row.generatedAt);
    if (generatedAt === null) {
      report(row.id, 'note: unparseable timestamp');
      continue;
    }
    notes.push(
      Object.freeze({
        id: row.id,
        plateLogId: row.plateLogId,
        anchor: parseAnchor(row.anchor),
        questionKey: row.questionKey,
        text: row.noteText,
        generatedAt,
      }),
    );
  }
  return frozenList(notes);
}

function draftsByParent(
  items: readonly SavedItemRow[],
  report: CorruptRowReporter,
  what: string,
): Map<number, FoodEntryDraft[]> {
  const byParent = new Map<number, FoodEntryDraft[]>();
  for (const row of items) {
    const draft = toDraft(row, report, what);
    if (draft === null) continue;
    const bucket = byParent.get(row.parentId);
    if (bucket) bucket.push(draft);
    else byParent.set(row.parentId, [draft]);
  }
  return byParent;
}

/** A saved meal with an unparseable timestamp or no readable entry is skipped (and reported). */
export function mapSavedMeals(set: SavedMealSet, report: CorruptRowReporter): readonly SavedMeal[] {
  const items = draftsByParent(set.items, report, 'saved meal item');
  const meals: SavedMeal[] = [];
  for (const row of set.meals) {
    const createdAtUtc = parseStoredInstant(row.createdAtUtc);
    const entries = items.get(row.id) ?? [];
    if (createdAtUtc === null || entries.length === 0) {
      report(row.id, 'saved meal: unreadable');
      continue;
    }
    meals.push(
      Object.freeze({ id: row.id, name: row.name, createdAtUtc, entries: frozenList(entries) }),
    );
  }
  return frozenList(meals);
}

/** A recipe with an unparseable timestamp, a bad serving count or no readable ingredient is skipped. */
export function mapRecipes(set: RecipeSet, report: CorruptRowReporter): readonly Recipe[] {
  const items = draftsByParent(set.items, report, 'recipe ingredient');
  const recipes: Recipe[] = [];
  for (const row of set.recipes) {
    const createdAtUtc = parseStoredInstant(row.createdAtUtc);
    const ingredients = items.get(row.id) ?? [];
    const cooked = row.cookedWeightGrams === null ? null : parseFinite(row.cookedWeightGrams);
    if (createdAtUtc === null || ingredients.length === 0 || !(row.servings >= 1)) {
      report(row.id, 'recipe: unreadable');
      continue;
    }
    recipes.push(
      Object.freeze({
        id: row.id,
        name: row.name,
        createdAtUtc,
        servings: row.servings,
        ...(cooked !== null && cooked > 0 ? { cookedWeightGrams: cooked } : {}),
        ingredients: frozenList(ingredients),
      }),
    );
  }
  return frozenList(recipes);
}
