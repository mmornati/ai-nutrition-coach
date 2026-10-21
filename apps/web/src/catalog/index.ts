export {
  classifyFoodGroup,
  classifyFoodByName,
  classifyFoodGroupsByName,
  foodGroupsOfFood,
} from './food-group-classifier';
export { LruCache } from './lru-cache';
export { seedFoods, seedForRef, type SeedFood, type SeedPreset } from './seed-foods';
export { foodName, isKnownUnit, quantityLabel, seedName, seedPresets } from './food-display';
export { foldText } from './fold';
export {
  createOffBarcodeSource,
  offProductUrl,
  OFF_FIELDS,
  OFF_ORIGIN,
  MAX_OFF_NAME_LENGTH,
  MAX_OFF_TAGS,
  MAX_OFF_TAG_LENGTH,
  type OffBarcodeResult,
  type OffBarcodeSource,
} from './off-barcode-source';
export {
  OfflineFirstFoodCatalog,
  SEARCH_CACHE_CAPACITY,
  BARCODE_CACHE_CAPACITY,
  type OfflineFirstFoodCatalogOptions,
} from './offline-first-catalog';
export { PrivacyPrefs, offLookupGate, type OffLookupChoice } from './privacy-prefs';
export {
  ManualEntrySession,
  INITIAL_MANUAL_ENTRY,
  type CommitPlate,
  type LogOutcome,
  type ManualEntryCatalogStatus,
  type ManualEntryError,
  type ManualEntryState,
} from './manual-entry';
export { useManualEntry } from './useManualEntry';
