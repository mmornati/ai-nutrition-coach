import type {
  BodyMeasurement,
  EncryptedStore,
  Exporter,
  FoodEntry,
  FoodEntryDraft,
  PlateLog,
  Profile,
  Recipe,
  SavedMeal,
  CoachStep,
} from '@anc/core';
import { createFormatExporter } from './csv-exporter';

function draftToJson(entry: FoodEntryDraft): Record<string, unknown> {
  return {
    databaseFood: {
      source: entry.databaseFood.source,
      sourceRef: entry.databaseFood.sourceRef,
      displayName: entry.databaseFood.displayName,
      foodGroup: entry.databaseFood.foodGroup,
      ...(entry.databaseFood.nutrientsPer100g
        ? { nutrientsPer100g: entry.databaseFood.nutrientsPer100g }
        : {}),
      ...(entry.databaseFood.extra ? { extra: entry.databaseFood.extra } : {}),
    },
    quantity: {
      low: entry.quantity.low,
      high: entry.quantity.high,
      unit: entry.quantity.unit,
      displayLabel: entry.quantity.displayLabel,
      ...(entry.quantity.grams !== undefined ? { grams: entry.quantity.grams } : {}),
      ...(entry.quantity.gramsEstimated !== undefined
        ? { gramsEstimated: entry.quantity.gramsEstimated }
        : {}),
    },
  };
}

function entryToJson(entry: FoodEntry): Record<string, unknown> {
  return { id: entry.id, plateLogId: entry.plateLogId, ...draftToJson(entry) };
}

/** The person's own templates, exported with their plates. */
export interface SavedExport {
  readonly meals: readonly SavedMeal[];
  readonly recipes: readonly Recipe[];
}

function savedMealToJson(meal: SavedMeal): Record<string, unknown> {
  return {
    id: meal.id,
    name: meal.name,
    createdAtUtc: new Date(meal.createdAtUtc).toISOString(),
    entries: meal.entries.map(draftToJson),
  };
}

function recipeToJson(recipe: Recipe): Record<string, unknown> {
  return {
    id: recipe.id,
    name: recipe.name,
    createdAtUtc: new Date(recipe.createdAtUtc).toISOString(),
    servings: recipe.servings,
    ...(recipe.cookedWeightGrams !== undefined
      ? { cookedWeightGrams: recipe.cookedWeightGrams }
      : {}),
    ingredients: recipe.ingredients.map(draftToJson),
  };
}

/** Weight in kg, waist in cm: the stored units, whatever the person's display units are. */
export const MEASUREMENT_UNIT = Object.freeze({ weight: 'kg', waist: 'cm' });

function measurementToJson(m: BodyMeasurement): Record<string, unknown> {
  return {
    kind: m.kind,
    day: m.day,
    measuredAtUtc: new Date(m.measuredAtUtc).toISOString(),
    value: m.value,
    unit: MEASUREMENT_UNIT[m.kind],
  };
}

function plateToJson(plate: PlateLog): Record<string, unknown> {
  return {
    id: plate.id,
    loggedAtUtc: new Date(plate.loggedAtUtc).toISOString(),
    // The meal the person chose (schema v5); absent when it is derived from the time.
    ...(plate.slot !== undefined ? { meal: plate.slot } : {}),
    entries: plate.entries.map(entryToJson),
  };
}

/**
 * The top-level `{"plates": [...]}` envelope, so fields can be added without breaking consumers.
 * Plates, plus the optional `profile` key when the person set one (the only preference exported),
 * the `savedMeals` and `recipes` keys when the person keeps any, and `bodyMeasurements` (dated
 * weigh-ins and waist, SI units) when they entered any, and the `coachStep` the person accepted
 * when there is one. No coach notes, settings or notices. The
 * CSV carries none of these (body measurements have their own CSV file).
 */
export function serializePlatesToJson(
  plates: readonly PlateLog[],
  profile?: Profile,
  saved?: SavedExport,
  measurements?: readonly BodyMeasurement[],
  coachStep?: CoachStep | null,
): string {
  return JSON.stringify({
    plates: plates.map(plateToJson),
    ...(profile !== undefined ? { profile } : {}),
    ...(saved !== undefined && saved.meals.length > 0
      ? { savedMeals: saved.meals.map(savedMealToJson) }
      : {}),
    ...(saved !== undefined && saved.recipes.length > 0
      ? { recipes: saved.recipes.map(recipeToJson) }
      : {}),
    ...(measurements !== undefined && measurements.length > 0
      ? { bodyMeasurements: measurements.map(measurementToJson) }
      : {}),
    // The one next step the person accepted from the coach, when there is one.
    ...(coachStep !== undefined && coachStep !== null
      ? {
          coachStep: {
            id: coachStep.id,
            acceptedAtUtc: new Date(coachStep.at).toISOString(),
            ...(coachStep.food !== undefined ? { food: coachStep.food } : {}),
          },
        }
      : {}),
  });
}

export const createJsonExporter = (store: EncryptedStore): Exporter =>
  createFormatExporter(store, 'json');
