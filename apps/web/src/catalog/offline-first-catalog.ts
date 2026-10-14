/**
 * `OfflineFirstFoodCatalog`: the `FoodCatalog` adapter (port of the earlier client).
 *
 * Searches an in-memory seeded list of common foods (curated, shipped with the app, source `seed`)
 * with a small LRU cache for offline replay (NFR5). The ranking is plain string matching,
 * exact > prefix > substring > token overlap, and the cache key is the case-folded, trimmed query
 * so a previously-seen search resolves identically offline.
 *
 * `lookupByBarcode` fans out to the Open Food Facts source, behind two gates:
 *  - a barcode already resolved in this process is answered from its own LRU (64 entries; separate
 *    from the 32-entry search LRU, because the keys live in different domains and the working sets
 *    differ), with no request;
 *  - `onlineLookupAllowed` (required) is asked right before a barcode would leave the device. The app passes a
 *    check of the person's answer to the one-time Open Food Facts notice, which is `false` until
 *    they have said OK and stays `false` when they chose "Don't look up online". A `false` (or a
 *    gate that throws) sends nothing and reports the barcode as not found, so the manual path
 *    opens; it is not cached, so a later OK is honoured. THE CATALOG REFUSES TO SEND A BARCODE
 *    UNLESS THE GATE ALLOWS IT, whatever the screen did.
 *
 * Only a definitive answer (a match, or "OFF has no such product") is cached. A transient failure
 * (timeout, 5xx, offline) must not poison the barcode for the rest of the process.
 *
 * No network call on the search path: the offline-first guarantee is structural, the search
 * adapter has no path that talks to the network. Both caches are in memory only.
 *
 * Failures are typed `catalogFailure` results, never a thrown error.
 */
import {
  catalogFailure,
  databaseFood,
  notFound,
  rankedMatches,
  type CatalogResult,
  type DatabaseFood,
  type FoodCatalog,
  type FoodMatch,
} from '@anc/core';
import { classifyFoodGroup } from './food-group-classifier';
import { LruCache } from './lru-cache';
import { createOffBarcodeSource, type OffBarcodeSource } from './off-barcode-source';
import { seedFoods, type SeedFood } from './seed-foods';

export const SEARCH_CACHE_CAPACITY = 32;
export const BARCODE_CACHE_CAPACITY = 64;
const DEFAULT_LIMIT = 10;

export interface OfflineFirstFoodCatalogOptions {
  readonly seeds?: readonly SeedFood[];
  readonly searchCacheCapacity?: number;
  readonly barcodeCacheCapacity?: number;
  readonly offSource?: OffBarcodeSource;
  /**
   * REQUIRED: there is no default that sends. The app passes a check of the person's answer to the
   * one-time Open Food Facts notice. Tests that want the lookup pass `async () => true`.
   */
  readonly onlineLookupAllowed: () => Promise<boolean>;
}

const seedRef = (seed: SeedFood): string => `seed:${seed.displayName.toLowerCase()}`;

function toDatabaseFood(seed: SeedFood): DatabaseFood {
  return databaseFood({
    sourceRef: seedRef(seed),
    displayName: seed.displayName,
    // A curated entry shipped in the app, not an Open Food Facts product.
    source: 'seed',
    foodGroup: seed.foodGroup,
  });
}

/**
 * Score a seed name against the query. 0 when there is no match:
 * exact 1.0, prefix 0.8, substring 0.6, token overlap 0.4 x overlap fraction (whole words).
 */
function score(query: string, name: string): number {
  if (name === query) return 1.0;
  if (name.startsWith(query)) return 0.8;
  if (name.includes(query)) return 0.6;
  const queryTokens = query.split(/\s+/);
  if (queryTokens.length <= 1) return 0.0;
  const nameTokens = name.split(/\s+/);
  const overlap = queryTokens.filter((t) => t.length > 0 && nameTokens.includes(t)).length;
  if (overlap === 0) return 0.0;
  return 0.4 * (overlap / queryTokens.length);
}

export class OfflineFirstFoodCatalog implements FoodCatalog {
  private readonly seeds: readonly SeedFood[];
  private readonly searchCache: LruCache<string, readonly FoodMatch[]>;
  private readonly barcodeCache: LruCache<string, CatalogResult>;
  private readonly offSource: OffBarcodeSource;
  private readonly onlineLookupAllowed: () => Promise<boolean>;

  constructor(options: OfflineFirstFoodCatalogOptions) {
    this.seeds = Object.freeze([...(options.seeds ?? seedFoods)]);
    this.searchCache = new LruCache(options.searchCacheCapacity ?? SEARCH_CACHE_CAPACITY);
    this.barcodeCache = new LruCache(options.barcodeCacheCapacity ?? BARCODE_CACHE_CAPACITY);
    this.offSource = options.offSource ?? createOffBarcodeSource();
    this.onlineLookupAllowed = options.onlineLookupAllowed;
  }

  /** Forgets every remembered query and barcode (the session ended). */
  clearCaches(): void {
    this.searchCache.clear();
    this.barcodeCache.clear();
  }

  /** Entries in the search LRU (exposed for tests). */
  get cacheCapacity(): number {
    return this.searchCache.capacity;
  }
  get cachedQueries(): number {
    return this.searchCache.length;
  }
  get cachedBarcodes(): number {
    return this.barcodeCache.length;
  }

  async search(query: string, options?: { readonly limit?: number }): Promise<CatalogResult> {
    try {
      const limit = options?.limit ?? DEFAULT_LIMIT;
      const normalized = query.trim().toLowerCase();
      // An empty query is an empty list; a not-found here would push the person into the manual
      // path on the very first keystroke.
      if (normalized.length === 0) return rankedMatches([]);

      // The key includes `limit`: the cached list is bounded by the limit it was written with, so
      // a later call with a larger limit must not be served the shorter list.
      const cacheKey = `${normalized}\u0000${limit}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached !== undefined) return rankedMatches(cached);

      const trimmed = this.rank(normalized).slice(0, Math.max(0, limit));
      if (trimmed.length === 0) return notFound(normalized);
      this.searchCache.put(cacheKey, trimmed);
      return rankedMatches(trimmed);
    } catch (error) {
      return catalogFailure('unknown', describe(error));
    }
  }

  async lookupBySourceRef(sourceRef: string): Promise<DatabaseFood | null> {
    const needle = sourceRef.toLowerCase();
    for (const seed of this.seeds) {
      if (seedRef(seed) === needle) return toDatabaseFood(seed);
    }
    return null;
  }

  /**
   * Resolve a packaged-food barcode. Empty / whitespace-only codes short-circuit to
   * `notFound('')`. Never throws.
   */
  async lookupByBarcode(code: string): Promise<CatalogResult> {
    try {
      const trimmed = code.trim();
      if (trimmed.length === 0) return notFound('');

      const cached = this.barcodeCache.get(trimmed);
      if (cached !== undefined) return cached;

      // Only an explicit `true` lets the barcode leave the device; anything else (a `false`, a
      // throw, a missing gate from untyped code) is closed.
      let allowed = false;
      try {
        allowed = (await this.onlineLookupAllowed()) === true;
      } catch {
        allowed = false; // fail closed: nothing is sent
      }
      if (!allowed) return notFound(trimmed);

      const result = await this.offSource.lookup(trimmed);
      let resolved: CatalogResult;
      switch (result.kind) {
        case 'match':
          resolved = rankedMatches([
            toBarcodeMatch(trimmed, result.displayName, result.categoryTags),
          ]);
          break;
        case 'notFound':
          resolved = notFound(trimmed);
          break;
        case 'failure':
          resolved = catalogFailure(result.reason, result.message);
          break;
      }

      // Only a definitive answer is remembered; the next scan after a failure retries.
      if (resolved.kind !== 'catalogFailure') this.barcodeCache.put(trimmed, resolved);
      return resolved;
    } catch (error) {
      return catalogFailure('unknown', describe(error));
    }
  }

  /**
   * Rank every seed whose name matches. Stable within a tier: the iteration order is the declared
   * order in `seed-foods.ts`, which is balanced across food groups. Tests rely on this.
   */
  private rank(query: string): FoodMatch[] {
    const scored: { match: FoodMatch; score: number }[] = [];
    for (const seed of this.seeds) {
      const s = score(query, seed.displayName.toLowerCase());
      if (s > 0) {
        scored.push({
          match: { food: toDatabaseFood(seed), confidence: s, presets: seed.presets },
          score: s,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.match);
  }
}

/**
 * The `FoodMatch` for a barcode-resolved product. The group comes from OFF's `categories_tags`;
 * with no usable tag the food lands in `other` so the arc still renders. `sourceRef` is the
 * verbatim barcode. OFF ships no curated presets, so the list is empty and the UI falls back to a
 * single `~1 serving` placeholder.
 */
function toBarcodeMatch(
  barcode: string,
  displayName: string,
  categoryTags: readonly string[],
): FoodMatch {
  return {
    food: databaseFood({
      sourceRef: barcode,
      displayName,
      source: 'off',
      foodGroup: classifyFoodGroup(categoryTags),
    }),
    confidence: 1.0,
    presets: [],
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unexpected error';
}
