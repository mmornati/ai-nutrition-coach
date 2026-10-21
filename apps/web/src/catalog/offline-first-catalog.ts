/**
 * `OfflineFirstFoodCatalog`: the `FoodCatalog` adapter (port of the earlier client).
 *
 * Searches an in-memory seeded list of common foods (curated, shipped with the app, source `seed`)
 * and then the CIQUAL table (3.4k generic foods, source `ciqual`, loaded once from the app's own
 * precached asset on the first search; see `ciqual-index.ts`), with a small LRU cache for offline
 * replay (NFR5). The seeds come first: their ranking is plain string matching, exact > prefix >
 * substring > every query word present; a seed is only listed when ALL the query words match it.
 * CIQUAL follows by token score. The seeds carry their own per-100 g nutrients, so they never wait
 * for the table; a search waits for it at most `ciqualWaitMs` and otherwise answers with the seeds
 * while the load carries on in the background. The cache key is the case-folded,
 * trimmed query so a previously-seen search resolves identically offline. Both kinds carry their
 * per-100 g nutrients and gram presets (docs/adr/0006). If the table cannot be loaded the search
 * still answers with the seeds (and is not cached, so a later search retries).
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
 * The only request on the search path is the first load of the CIQUAL table from the app's own
 * origin (served by the service worker's precache when offline; see `ciqual-index.ts` and
 * docs/telemetry-posture.md). Nothing about the query leaves the device: the adapter has no path
 * that talks to a third party. Both caches are in memory only.
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
import { currentLocale } from '../i18n';
import type { Locale } from '../i18n/locale';
import {
  CIQUAL_SOURCE_PREFIX,
  CiqualIndex,
  CiqualParseError,
  ciqualDatabaseFood,
  type CiqualLoader,
} from './ciqual-index';
import { foldText } from './fold';
import { ciqualPresets, offPresets, seedName, seedPresets } from './food-display';
import { classifyFoodGroup } from './food-group-classifier';
import { LruCache } from './lru-cache';
import {
  createOffBarcodeSource,
  type OffBarcodeResult,
  type OffBarcodeSource,
} from './off-barcode-source';
import { seedFoods, type SeedFood } from './seed-foods';

export const SEARCH_CACHE_CAPACITY = 32;
export const BARCODE_CACHE_CAPACITY = 64;
const DEFAULT_LIMIT = 10;
/** The longest wait between two attempts to load the CIQUAL table. */
export const CIQUAL_RETRY_CAP_MS = 600_000;
/** A table that arrived but could not be read is fetched again at most this many times. */
const CIQUAL_MAX_PARSE_FAILURES = 2;

export interface OfflineFirstFoodCatalogOptions {
  readonly seeds?: readonly SeedFood[];
  readonly searchCacheCapacity?: number;
  readonly barcodeCacheCapacity?: number;
  readonly offSource?: OffBarcodeSource;
  /**
   * Where the CIQUAL table comes from, called lazily on the first search. Omitted = no CIQUAL
   * (the curated seeds only: what unit tests of the seed ranking want). The app passes
   * `createCiqualFetchLoader()`.
   */
  readonly ciqual?: CiqualLoader;
  /**
   * After a failed CIQUAL load, wait this long (ms) before trying again; the wait doubles with each
   * further failure up to {@link CIQUAL_RETRY_CAP_MS}. Default 30 s.
   */
  readonly ciqualRetryMs?: number;
  /** A search waits at most this long (ms) for the table, then answers with the seeds. Default 1500. */
  readonly ciqualWaitMs?: number;
  /**
   * The language names, portion labels and Open Food Facts names are worded in, asked at call time
   * (so a language switch takes effect on the next search). Defaults to the app's current one.
   */
  readonly locale?: () => Locale;
  /** A seed's display name in a language. Defaults to the catalogue's (tests pass their own). */
  readonly nameOf?: (seed: SeedFood, locale: Locale) => string;
  /**
   * REQUIRED: there is no default that sends. The app passes a check of the person's answer to the
   * one-time Open Food Facts notice. Tests that want the lookup pass `async () => true`.
   */
  readonly onlineLookupAllowed: () => Promise<boolean>;
}

function toDatabaseFood(seed: SeedFood, displayName: string): DatabaseFood {
  return databaseFood({
    nutrientsPer100g: seed.nutrients,
    sourceRef: seed.sourceRef,
    // The text is kept with the plate (exports stay readable); the plate itself is shown from the
    // catalogue's name for `sourceRef`, so a later language switch still reads right.
    displayName,
    // A curated entry shipped in the app, not an Open Food Facts product.
    source: 'seed',
    foodGroup: seed.foodGroup,
  });
}

/**
 * Score a seed name against the query (both already folded: lower-case, no accents). 0 when there
 * is no match: exact 1.0, prefix 0.8, substring 0.6, all query words present 0.4 (whole words).
 */
function score(query: string, name: string): number {
  if (name === query) return 1.0;
  if (name.startsWith(query)) return 0.8;
  if (name.includes(query)) return 0.6;
  const queryTokens = query.split(/\s+/).filter((t) => t.length > 0);
  if (queryTokens.length <= 1) return 0.0;
  const nameTokens = name.split(/\s+/);
  // Every query word must be a word of the name: "riz basmati" is not "Rice".
  return queryTokens.every((t) => nameTokens.includes(t)) ? 0.4 : 0.0;
}

export class OfflineFirstFoodCatalog implements FoodCatalog {
  private readonly seeds: readonly SeedFood[];
  private readonly searchCache: LruCache<string, readonly FoodMatch[]>;
  private readonly barcodeCache: LruCache<string, CatalogResult>;
  private readonly offSource: OffBarcodeSource;
  private readonly onlineLookupAllowed: () => Promise<boolean>;
  private readonly locale: () => Locale;
  private readonly nameOf: (seed: SeedFood, locale: Locale) => string;
  private readonly ciqualLoader: CiqualLoader | undefined;
  private readonly ciqualRetryMs: number;
  private readonly ciqualWaitMs: number;
  private ciqualFailures = 0;
  private ciqualParseFailures = 0;
  private ciqualIndex: CiqualIndex | null = null;
  private ciqualLoading: Promise<CiqualIndex | null> | null = null;
  private ciqualFailedAt = Number.NEGATIVE_INFINITY;
  /** Display name and folded name per seed, per locale; built lazily (seeds and `nameOf` are fixed). */
  private readonly folded = new Map<Locale, readonly { name: string; folded: string }[]>();

  constructor(options: OfflineFirstFoodCatalogOptions) {
    this.seeds = Object.freeze([...(options.seeds ?? seedFoods)]);
    this.searchCache = new LruCache(options.searchCacheCapacity ?? SEARCH_CACHE_CAPACITY);
    this.barcodeCache = new LruCache(options.barcodeCacheCapacity ?? BARCODE_CACHE_CAPACITY);
    this.offSource = options.offSource ?? createOffBarcodeSource();
    this.onlineLookupAllowed = options.onlineLookupAllowed;
    this.locale = options.locale ?? currentLocale;
    this.nameOf = options.nameOf ?? seedName;
    this.ciqualLoader = options.ciqual;
    this.ciqualRetryMs = options.ciqualRetryMs ?? 30_000;
    this.ciqualWaitMs = options.ciqualWaitMs ?? 1500;
  }

  /**
   * The CIQUAL index, loading it on first use. `null` when there is no loader, the load failed
   * (retried after an exponentially growing wait: `ciqualRetryMs`, twice that, ... capped at 10
   * minutes) or the file arrived unreadable twice (then never again this session). Never throws;
   * concurrent callers share one load.
   */
  private ciqual(): Promise<CiqualIndex | null> {
    if (this.ciqualIndex !== null) return Promise.resolve(this.ciqualIndex);
    const loader = this.ciqualLoader;
    if (loader === undefined) return Promise.resolve(null);
    if (this.ciqualLoading === null) {
      if (this.ciqualParseFailures >= CIQUAL_MAX_PARSE_FAILURES) return Promise.resolve(null);
      const wait = Math.min(
        this.ciqualRetryMs * 2 ** Math.max(0, this.ciqualFailures - 1),
        CIQUAL_RETRY_CAP_MS,
      );
      if (this.ciqualFailures > 0 && Date.now() - this.ciqualFailedAt < wait) {
        return Promise.resolve(null);
      }
      this.ciqualLoading = this.loadCiqual(loader).finally(() => {
        this.ciqualLoading = null;
      });
    }
    return this.ciqualLoading;
  }

  /** The table if it arrives within `ciqualWaitMs`; otherwise `null`, and the load carries on. */
  private async ciqualWithin(): Promise<CiqualIndex | null> {
    const loading = this.ciqual();
    if (this.ciqualLoading === null) return loading;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.ciqualWaitMs);
    });
    try {
      return await Promise.race([loading, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async loadCiqual(loader: CiqualLoader): Promise<CiqualIndex | null> {
    try {
      this.ciqualIndex = CiqualIndex.fromTable(await loader());
      this.ciqualFailures = 0;
    } catch (error) {
      this.ciqualFailures++;
      this.ciqualFailedAt = Date.now();
      if (error instanceof CiqualParseError) this.ciqualParseFailures++;
    }
    return this.ciqualIndex;
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
      const locale = this.locale();
      // An empty query is an empty list; a not-found here would push the person into the manual
      // path on the very first keystroke.
      if (normalized.length === 0) return rankedMatches([]);

      // The key includes `limit`: the cached list is bounded by the limit it was written with, so
      // a later call with a larger limit must not be served the shorter list. It includes the
      // language too: the cached foods carry their names and portion labels in it.
      const cacheKey = `${locale}\u0000${normalized}\u0000${limit}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached !== undefined) return rankedMatches(cached);

      const index = await this.ciqualWithin();
      const trimmed = this.rank(foldText(normalized), locale, index, limit).slice(
        0,
        Math.max(0, limit),
      );
      if (trimmed.length === 0) return notFound(normalized);
      // A list built without the table (not loaded yet, slow, or the load failed) is not
      // remembered, so the next search gets the full one.
      if (index !== null || this.ciqualLoader === undefined) {
        this.searchCache.put(cacheKey, trimmed);
      }
      return rankedMatches(trimmed);
    } catch (error) {
      return catalogFailure('unknown', describe(error));
    }
  }

  async lookupBySourceRef(sourceRef: string): Promise<DatabaseFood | null> {
    const needle = sourceRef.toLowerCase();
    const locale = this.locale();
    for (const seed of this.seeds) {
      if (seed.sourceRef === needle) return toDatabaseFood(seed, this.nameOf(seed, locale));
    }
    if (!needle.startsWith(CIQUAL_SOURCE_PREFIX)) return null;
    const index = await this.ciqual();
    if (index !== null && needle.startsWith(CIQUAL_SOURCE_PREFIX)) {
      const entry = index.byCode(needle.slice(CIQUAL_SOURCE_PREFIX.length));
      if (entry !== undefined) return ciqualDatabaseFood(index, entry, locale);
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

      // The name is the product's in the person's language, so the language is part of the key.
      const locale = this.locale();
      const cacheKey = `${locale}:${trimmed}`;
      const cached = this.barcodeCache.get(cacheKey);
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

      const result = await this.offSource.lookup(trimmed, { locale });
      let resolved: CatalogResult;
      switch (result.kind) {
        case 'match':
          resolved = rankedMatches([toBarcodeMatch(trimmed, result, locale)]);
          break;
        case 'notFound':
          resolved = notFound(trimmed);
          break;
        case 'failure':
          resolved = catalogFailure(result.reason, result.message);
          break;
      }

      // Only a definitive answer is remembered; the next scan after a failure retries.
      if (resolved.kind !== 'catalogFailure') this.barcodeCache.put(cacheKey, resolved);
      return resolved;
    } catch (error) {
      return catalogFailure('unknown', describe(error));
    }
  }

  /**
   * Rank every seed whose name matches, in the current language's name or the English one (so
   * "pomme" and "apple" both find the apple), ignoring case and accents. Stable within a tier: the
   * iteration order is the declared order in `seed-foods.ts`, which is balanced across food
   * groups. Tests rely on this.
   */
  private foldedNames(locale: Locale): readonly { name: string; folded: string }[] {
    let list = this.folded.get(locale);
    if (list === undefined) {
      list = this.seeds.map((seed) => {
        const name = this.nameOf(seed, locale);
        return { name, folded: foldText(name) };
      });
      this.folded.set(locale, list);
    }
    return list;
  }

  private rank(
    query: string,
    locale: Locale,
    index: CiqualIndex | null,
    limit: number,
  ): FoodMatch[] {
    const scored: { match: FoodMatch; score: number }[] = [];
    const names = this.foldedNames(locale);
    const english = locale === 'en' ? null : this.foldedNames('en');
    const matchedCodes = new Set<string>();
    for (const [i, seed] of this.seeds.entries()) {
      const { name, folded } = names[i] as { name: string; folded: string };
      const s = Math.max(
        score(query, folded),
        english === null ? 0 : score(query, (english[i] as { folded: string }).folded),
      );
      if (s > 0) {
        if (seed.ciqual !== undefined) matchedCodes.add(seed.ciqual);
        scored.push({
          match: {
            food: toDatabaseFood(seed, name),
            confidence: s,
            presets: seedPresets(seed, locale),
          },
          score: s,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const matches = scored.map((s) => s.match);
    if (index === null) return matches;

    // The curated foods first, then the table; the table's version of a seed already listed is left
    // out. Table confidence stays below a curated exact match: 0.3 + 0.45 x score.
    for (const hit of index.search(query, limit, { exclude: matchedCodes, locale })) {
      matches.push({
        food: ciqualDatabaseFood(index, hit.entry, locale),
        confidence: Math.round((0.3 + 0.45 * hit.score) * 1000) / 1000,
        presets: ciqualPresets(hit.entry.subgroupCode, locale),
      });
    }
    return matches;
  }
}

/**
 * The `FoodMatch` for a barcode-resolved product. The group comes from OFF's `categories_tags`;
 * with no usable tag the food lands in `other` so the arc still renders. `sourceRef` is the
 * verbatim barcode. Nutrients and Nutri-Score / NOVA are whatever OFF knows (unknown stays
 * absent). Presets are the product's serving, "100 g" and the whole pack, in grams.
 */
function toBarcodeMatch(
  barcode: string,
  product: Extract<OffBarcodeResult, { kind: 'match' }>,
  locale: Locale,
): FoodMatch {
  return {
    food: databaseFood({
      sourceRef: barcode,
      displayName: product.displayName,
      source: 'off',
      foodGroup: classifyFoodGroup(product.categoryTags),
      ...(product.nutrientsPer100g ? { nutrientsPer100g: product.nutrientsPer100g } : {}),
      ...(product.extra ? { extra: product.extra } : {}),
    }),
    confidence: 1.0,
    presets: offPresets(
      { servingGrams: product.servingGrams, packGrams: product.packGrams },
      locale,
    ),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unexpected error';
}
