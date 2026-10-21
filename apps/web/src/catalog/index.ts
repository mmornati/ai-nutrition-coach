export {
  classifyFoodGroup,
  classifyFoodByName,
  classifyFoodGroupsByName,
  foodGroupsOfFood,
} from './food-group-classifier';
export { LruCache } from './lru-cache';
export { seedFoods, seedForRef, type SeedFood, type SeedPreset } from './seed-foods';
export {
  ciqualPresets,
  foodName,
  isKnownUnit,
  offPresets,
  quantityLabel,
  seedName,
  seedPresets,
} from './food-display';
export {
  CIQUAL_SOURCE_PREFIX,
  CiqualIndex,
  ciqualDatabaseFood,
  ciqualName,
  createCiqualFetchLoader,
  indexTokens,
  type CiqualEntry,
  type CiqualHit,
  type CiqualLoader,
} from './ciqual-index';
export { ciqualFoodGroup, GROUP_RULES, SUBGROUP_RULES } from './ciqual-groups';
export { portionsFor, SUBGROUP_PORTIONS, type Portion, type PortionKind } from './ciqual-portions';
export { foldText } from './fold';
export {
  createOffBarcodeSource,
  offProductUrl,
  OFF_FIELDS,
  OFF_ORIGIN,
  MAX_OFF_PACK_GRAMS,
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
