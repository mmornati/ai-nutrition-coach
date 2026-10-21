import type { EncryptedStore, Exporter, FoodEntry, PlateLog, Profile } from '@anc/core';
import { createFormatExporter } from './csv-exporter';

function entryToJson(entry: FoodEntry): Record<string, unknown> {
  return {
    id: entry.id,
    plateLogId: entry.plateLogId,
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

function plateToJson(plate: PlateLog): Record<string, unknown> {
  return {
    id: plate.id,
    loggedAtUtc: new Date(plate.loggedAtUtc).toISOString(),
    entries: plate.entries.map(entryToJson),
  };
}

/**
 * The top-level `{"plates": [...]}` envelope, so fields can be added without breaking consumers.
 * Plates, plus the optional `profile` key when the person set one (the only preference exported).
 * No coach notes, settings or notices.
 */
export function serializePlatesToJson(plates: readonly PlateLog[], profile?: Profile): string {
  return JSON.stringify({
    plates: plates.map(plateToJson),
    ...(profile !== undefined ? { profile } : {}),
  });
}

export const createJsonExporter = (store: EncryptedStore): Exporter =>
  createFormatExporter(store, 'json');
