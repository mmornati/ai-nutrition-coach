import type { EncryptedStore, Exporter, FoodEntry, PlateLog } from '@anc/core';
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
    },
    quantity: {
      low: entry.quantity.low,
      high: entry.quantity.high,
      unit: entry.quantity.unit,
      displayLabel: entry.quantity.displayLabel,
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
 * Plates only: no coach notes, settings or notices.
 */
export function serializePlatesToJson(plates: readonly PlateLog[]): string {
  return JSON.stringify({ plates: plates.map(plateToJson) });
}

export const createJsonExporter = (store: EncryptedStore): Exporter =>
  createFormatExporter(store, 'json');
