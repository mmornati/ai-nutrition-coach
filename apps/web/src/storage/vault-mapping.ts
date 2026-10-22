// Small conversions shared by the SQL store and the in-memory reference for the vault snapshot.

import type { VaultFood } from '@anc/core';
import type { EntryInsert } from './ops';

export function toVaultFood(e: EntryInsert): VaultFood {
  return {
    sourceRef: e.sourceRef,
    displayName: e.displayName,
    source: e.source,
    foodGroup: e.foodGroup,
    quantityLow: e.quantityLow,
    quantityHigh: e.quantityHigh,
    quantityUnit: e.quantityUnit,
    quantityDisplayLabel: e.quantityDisplayLabel,
    quantityGrams: e.quantityGrams ?? null,
    quantityGramsEstimated: e.quantityGramsEstimated ?? null,
    nutrientsPer100g: e.nutrientsPer100g ?? null,
    foodExtra: e.foodExtra ?? null,
  };
}

export function fromVaultFood(f: VaultFood): EntryInsert {
  return {
    sourceRef: f.sourceRef,
    displayName: f.displayName,
    source: f.source,
    foodGroup: f.foodGroup,
    quantityLow: f.quantityLow,
    quantityHigh: f.quantityHigh,
    quantityUnit: f.quantityUnit,
    quantityDisplayLabel: f.quantityDisplayLabel,
    quantityGrams: f.quantityGrams,
    quantityGramsEstimated: f.quantityGramsEstimated,
    nutrientsPer100g: f.nutrientsPer100g,
    foodExtra: f.foodExtra,
  };
}

const NOTE_KEY = /^note:(\d+)$/;
const NOTE_PREFIX = 'note:';

/**
 * A dismissal key as it goes into a snapshot: `note:<local id>` becomes `note:<note uid>` (ids are
 * local to a store), anything else is kept as is. `null` for a note marker whose note is gone.
 */
export function dismissalKeyToVault(
  key: string,
  noteUidById: ReadonlyMap<number, string>,
): string | null {
  const match = NOTE_KEY.exec(key);
  if (!match) return key;
  const uid = noteUidById.get(Number(match[1]));
  return uid === undefined ? null : `${NOTE_PREFIX}${uid}`;
}

/** The inverse, for applying a snapshot: `null` when the note is not in this store. */
export function dismissalKeyFromVault(
  key: string,
  noteIdByUid: ReadonlyMap<string, number>,
): string | null {
  if (!key.startsWith(NOTE_PREFIX)) return key;
  const id = noteIdByUid.get(key.slice(NOTE_PREFIX.length));
  return id === undefined ? null : `${NOTE_PREFIX}${id}`;
}
