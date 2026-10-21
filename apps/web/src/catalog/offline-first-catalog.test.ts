// `OfflineFirstFoodCatalog`: search path, barcode path, online-lookup gate, LRU caches. Ported
// one-to-one from the earlier client and
// Ported from the earlier client.
import { describe, expect, it } from 'vitest';
import type { CatalogResult, FoodGroup } from '@anc/core';
import { FakeFetch } from '../net/testing';
import { LruCache } from './lru-cache';
import {
  createOffBarcodeSource,
  type OffBarcodeResult,
  type OffBarcodeSource,
} from './off-barcode-source';
import { OfflineFirstFoodCatalog } from './offline-first-catalog';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { seedName } from './food-display';
import { seedFoods, seedForRef, type SeedFood } from './seed-foods';

const allow = async (): Promise<boolean> => true;

/** A seed of the test's own: its id is its name, so `nameOf: (s) => s.id` reads it back. */
const custom = (name: string, foodGroup: FoodGroup): SeedFood => ({
  id: name,
  sourceRef: `seed:${name.toLowerCase()}`,
  foodGroup,
  nutrients: { energyKcal: 100 },
  presets: seedFoods[0]!.presets,
});
const idAsName = { nameOf: (s: SeedFood) => s.id };

const inFrench = () =>
  new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow, locale: () => 'fr' });

function ranked(result: CatalogResult) {
  if (result.kind !== 'rankedMatches')
    throw new Error(`expected rankedMatches, got ${result.kind}`);
  return result.matches;
}

/** Test double for `OffBarcodeSource`: no network, a typed result per barcode. */
class FakeOffSource implements OffBarcodeSource {
  private readonly responses = new Map<string, OffBarcodeResult>();
  private readonly counts = new Map<string, number>();
  totalCalls = 0;
  locales: (string | undefined)[] = [];

  callCount(barcode: string): number {
    return this.counts.get(barcode) ?? 0;
  }
  setMatch(barcode: string, displayName: string, categoryTags: string[]): void {
    this.responses.set(barcode, { kind: 'match', barcode, displayName, categoryTags });
  }
  setNotFound(barcode: string): void {
    this.responses.set(barcode, { kind: 'notFound', barcode });
  }
  setFailure(barcode: string, message: string): void {
    this.responses.set(barcode, { kind: 'failure', barcode, reason: 'httpError', message });
  }
  async lookup(barcode: string, options?: { locale?: string }): Promise<OffBarcodeResult> {
    this.totalCalls++;
    this.locales.push(options?.locale);
    this.counts.set(barcode, this.callCount(barcode) + 1);
    return this.responses.get(barcode) ?? { kind: 'notFound', barcode };
  }
}

describe('OfflineFirstFoodCatalog', () => {
  it('seeded list covers 30+ foods across the four food groups, each with honest ~ presets', () => {
    expect(seedFoods.length).toBeGreaterThanOrEqual(30);
    const groups = new Set<FoodGroup>(seedFoods.map((s) => s.foodGroup));
    for (const g of ['vegFruit', 'protein', 'starch', 'dairy', 'other'] as const) {
      expect(groups.has(g), g).toBe(true);
    }
    for (const s of seedFoods) {
      expect(s.presets.length, s.id).toBeGreaterThan(0);
    }
    expect(new Set(seedFoods.map((s) => s.id)).size).toBe(seedFoods.length);
    expect(new Set(seedFoods.map((s) => seedName(s, 'en').toLowerCase())).size).toBe(
      seedFoods.length,
    );
  });

  it('every seed has a name in each catalogue, and every catalogue name is a seed', () => {
    const ids = seedFoods.map((s) => s.id).sort();
    expect(Object.keys(en.foods.names).sort()).toEqual(ids);
    expect(Object.keys(fr.foods.names).sort()).toEqual(ids);
  });

  it('sourceRef is frozen as seed:<English name, lower-cased>, so stored plates keep resolving', () => {
    for (const s of seedFoods) {
      expect(s.sourceRef, s.id).toBe(
        `seed:${en.foods.names[s.id as keyof typeof en.foods.names].toLowerCase()}`,
      );
      expect(seedForRef(s.sourceRef)).toBe(s);
    }
    // The refs written before the ids existed, including the multi-word ones.
    expect(seedForRef('seed:chicken breast')?.id).toBe('chickenBreast');
    expect(seedForRef('seed:sweet potato')?.id).toBe('sweetPotato');
    expect(seedForRef('SEED:Apple')?.id).toBe('apple');
    expect(seedForRef('seed:unknown')).toBeUndefined();
  });

  it('HAPPY_PATH: partial query "salm" surfaces Salmon ranked first', async () => {
    const matches = ranked(
      await new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }).search('salm'),
    );
    expect(matches[0]?.food.displayName).toBe('Salmon');
  });

  it('EMPTY_QUERY returns empty rankedMatches (never notFound); so does whitespace', async () => {
    const catalog = new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow });
    expect(ranked(await catalog.search(''))).toEqual([]);
    expect(ranked(await catalog.search('   '))).toEqual([]);
  });

  it('NO_MATCH returns a typed notFound with the (normalised) query', async () => {
    expect(
      await new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }).search('zxqwer'),
    ).toEqual({
      kind: 'notFound',
      query: 'zxqwer',
    });
  });

  it('RANKED_ORDER: exact > prefix > substring > token-overlap', async () => {
    const matches = ranked(
      await new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }).search('apple'),
    );
    expect(matches[0]?.food.displayName).toBe('Apple');
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1]!.confidence).toBeGreaterThanOrEqual(matches[i]!.confidence);
    }
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      ...idAsName,
      seeds: [
        custom('Big Apple Pie', 'other'),
        custom('Apple', 'vegFruit'),
        custom('Apple Sauce', 'other'),
        custom('Red Apple Pie', 'other'),
      ],
    });
    const out = ranked(await catalog.search('apple'));
    expect(out.map((m) => [m.food.displayName, m.confidence])).toEqual([
      ['Apple', 1.0],
      ['Apple Sauce', 0.8],
      ['Big Apple Pie', 0.6],
      ['Red Apple Pie', 0.6],
    ]);
  });

  it('a seed needs ALL the query words: all as whole words score 0.4, a missing one lists nothing', async () => {
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      ...idAsName,
      seeds: [custom('Sweet Potato', 'starch')],
    });
    // Not a substring of the name as a whole, but both words are whole tokens of it.
    const out = ranked(await catalog.search('potato sweet'));
    expect(out[0]?.confidence).toBeCloseTo(0.4);
    // "mash" is not in the name: the seed is not listed at all.
    expect((await catalog.search('potato mash')).kind).toBe('notFound');
  });

  it('case-insensitive matching: "SALM" matches Salmon', async () => {
    const matches = ranked(
      await new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }).search('SALM'),
    );
    expect(matches.some((m) => m.food.displayName === 'Salmon')).toBe(true);
  });

  it('LIMIT: the limit parameter caps the returned matches', async () => {
    expect(
      ranked(
        await new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }).search('a', { limit: 3 }),
      ).length,
    ).toBeLessThanOrEqual(3);
  });

  it('OFFLINE_HIT: a repeat query is replayed from the cache in the same order', async () => {
    const catalog = new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow });
    const first = ranked(await catalog.search('rice')).map((m) => m.food.displayName);
    expect(catalog.cachedQueries).toBe(1);
    const second = ranked(await catalog.search('rice')).map((m) => m.food.displayName);
    expect(second).toEqual(first);
  });

  it('the cache key is case-folded and trimmed', async () => {
    const catalog = new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow });
    await catalog.search('rice');
    expect(catalog.cachedQueries).toBe(1);
    await catalog.search('  RICE  ');
    expect(catalog.cachedQueries).toBe(1); // promoted, not re-inserted
  });

  it('a FoodMatch carries the food, a confidence and the honest presets', async () => {
    const matches = ranked(
      await new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }).search('salmon'),
    );
    const salmon = matches.find((m) => m.food.displayName === 'Salmon')!;
    expect(salmon.confidence).toBeGreaterThanOrEqual(0);
    expect(salmon.confidence).toBeLessThanOrEqual(1);
    expect(salmon.food.foodGroup).toBe('protein');
    expect(salmon.presets[0]!.low).toBe(salmon.presets[0]!.high);
    expect(salmon.presets[0]!.unit).not.toBe('');
    expect(salmon.presets[0]!.displayLabel.startsWith('~')).toBe(true);
  });

  it('seeded foods are source "seed" (not Open Food Facts) with sourceRef seed:<name>', async () => {
    const catalog = new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow });
    const first = ranked(await catalog.search('apple'))[0]!;
    expect(first.food.source).toBe('seed');
    const byRef = await catalog.lookupBySourceRef('seed:apple');
    expect(byRef?.source).toBe('seed');
    expect(byRef?.sourceRef.startsWith('seed:')).toBe(true);
    expect(await catalog.lookupBySourceRef('SEED:Apple')).toMatchObject({ displayName: 'Apple' });
    expect(await catalog.lookupBySourceRef('seed:nothing')).toBeNull();
  });

  it('a stored seed ref resolves to the name in the current language', async () => {
    expect(await inFrench().lookupBySourceRef('seed:chicken breast')).toMatchObject({
      sourceRef: 'seed:chicken breast',
      displayName: 'Filet de poulet',
    });
  });

  it('a small-limit search does not shadow a later larger-limit one', async () => {
    const catalog = new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow });
    expect(ranked(await catalog.search('e', { limit: 2 }))).toHaveLength(2);
    expect(ranked(await catalog.search('e', { limit: 10 })).length).toBeGreaterThan(2);
    expect(ranked(await catalog.search('e', { limit: 2 }))).toHaveLength(2);
    expect(catalog.cachedQueries).toBe(2);
  });

  it('the search path makes no network call', async () => {
    const f = new FakeFetch();
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      offSource: createOffBarcodeSource({ fetchImpl: f.fetch }),
    });
    await catalog.search('rice');
    await catalog.search('zxqwer');
    expect(f.requests).toHaveLength(0);
  });

  it('search failures are typed catalogFailure, never a thrown error', async () => {
    // A ranker that throws:
    const bad = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      seeds: [{ id: 'x', sourceRef: 'seed:x', foodGroup: 'other', nutrients: {}, presets: [] }],
    });
    (bad as unknown as { rank: () => never }).rank = () => {
      throw new Error('boom');
    };
    expect(await bad.search('x')).toEqual({
      kind: 'catalogFailure',
      reason: 'unknown',
      message: 'boom',
    });
  });
});

describe('OfflineFirstFoodCatalog in French', () => {
  const names = async (catalog: OfflineFirstFoodCatalog, query: string) =>
    ranked(await catalog.search(query)).map((m) => m.food.displayName);

  it('finds a food by its French name, whatever the case or accents', async () => {
    const catalog = inFrench();
    expect((await names(catalog, 'pomme'))[0]).toBe('Pomme');
    expect((await names(catalog, 'Pomme'))[0]).toBe('Pomme');
    expect((await names(catalog, 'POMME'))[0]).toBe('Pomme');
    expect(await names(catalog, 'epinards')).toEqual(['Épinards']);
    expect(await names(catalog, 'Épinards')).toEqual(['Épinards']);
    expect(await names(catalog, 'EPINARDS')).toEqual(['Épinards']);
    expect(await names(catalog, 'oeufs')).toEqual(['Œufs']);
    expect(await names(catalog, 'boeuf')).toEqual(['Bœuf']);
    expect(await names(catalog, 'kefir')).toEqual(['Kéfir']);
    expect(await names(catalog, 'pates')).toEqual(['Pâtes']);
  });

  it('also finds it by its English name, shown in French', async () => {
    const catalog = inFrench();
    expect((await names(catalog, 'apple'))[0]).toBe('Pomme');
    expect(await names(catalog, 'spinach')).toEqual(['Épinards']);
    expect((await names(catalog, 'SALM'))[0]).toBe('Saumon');
  });

  it('ranks the French name the way English names are ranked', async () => {
    const out = ranked(await inFrench().search('pomme'));
    expect(out.map((m) => [m.food.displayName, m.confidence])).toEqual([
      ['Pomme', 1.0],
      ['Pomme de terre', 0.8],
    ]);
  });

  it('English is unchanged: a French word finds nothing there', async () => {
    const english = new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow, locale: () => 'en' });
    expect(await english.search('pomme')).toEqual({ kind: 'notFound', query: 'pomme' });
    expect((await names(english, 'apple'))[0]).toBe('Apple');
  });

  it('keeps the frozen English sourceRef and words the presets in French', async () => {
    const [chicken] = ranked(await inFrench().search('poulet'));
    expect(chicken!.food).toMatchObject({
      sourceRef: 'seed:chicken breast',
      displayName: 'Filet de poulet',
      source: 'seed',
    });
    expect(chicken!.presets.map((p) => p.displayLabel)).toEqual(['~1 poing']);
    const [salmon] = ranked(await inFrench().search('saumon'));
    expect(salmon!.presets.map((p) => p.displayLabel)).toEqual(['~1 poing', '~1,5 poing']);
    const [spinach] = ranked(await inFrench().search('epinards'));
    expect(spinach!.presets.map((p) => p.displayLabel)).toEqual(['~1–2 tasses']);
  });

  it('the search cache is per language', async () => {
    let locale: 'en' | 'fr' = 'en';
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      locale: () => locale,
    });
    expect(await names(catalog, 'rice')).toEqual(['Rice']);
    locale = 'fr';
    expect(await names(catalog, 'rice')).toEqual(['Riz']);
    expect(catalog.cachedQueries).toBe(2);
    locale = 'en';
    expect(await names(catalog, 'rice')).toEqual(['Rice']);
  });

  it('asks the barcode source for the language, and caches the answer per language', async () => {
    const off = new FakeOffSource();
    off.setMatch('123', 'Chocolat', []);
    let locale: 'en' | 'fr' = 'fr';
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      offSource: off,
      locale: () => locale,
    });
    await catalog.lookupByBarcode('123');
    await catalog.lookupByBarcode('123');
    expect(off.locales).toEqual(['fr']);
    locale = 'en';
    await catalog.lookupByBarcode('123');
    expect(off.locales).toEqual(['fr', 'en']);
  });
});

describe('OfflineFirstFoodCatalog.lookupByBarcode', () => {
  const setup = () => {
    const off = new FakeOffSource();
    return {
      off,
      catalog: new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow, offSource: off }),
    };
  };

  it('HAPPY_PATH_KNOWN: resolves to a single match with the OFF name and the barcode as sourceRef', async () => {
    const { off, catalog } = setup();
    off.setMatch('3017620422003', 'Nutella', ['en:spreads', 'en:sweet-spreads']);
    const matches = ranked(await catalog.lookupByBarcode('3017620422003'));
    expect(matches).toHaveLength(1);
    expect(matches[0]!.food).toMatchObject({
      displayName: 'Nutella',
      sourceRef: '3017620422003',
      source: 'off',
    });
    // OFF ships no serving or pack here: only "100 g".
    expect(matches[0]!.presets.map((q) => q.grams)).toEqual([100]);
    expect(off.callCount('3017620422003')).toBe(1);
  });

  it('CACHE_HIT: a repeat scan is answered from the cache with no second network call', async () => {
    const { off, catalog } = setup();
    off.setMatch('3017620422003', 'Nutella', ['en:spreads']);
    const first = await catalog.lookupByBarcode('3017620422003');
    expect(first.kind).toBe('rankedMatches');
    expect(catalog.cachedBarcodes).toBe(1);
    expect(await catalog.lookupByBarcode('3017620422003')).toEqual(first);
    expect(off.callCount('3017620422003')).toBe(1);
  });

  it('CACHE_KEY_TRIMMED: whitespace around a barcode hits the same cache entry', async () => {
    const { off, catalog } = setup();
    off.setMatch('3017620422003', 'Nutella', ['en:spreads']);
    await catalog.lookupByBarcode('3017620422003');
    await catalog.lookupByBarcode('  3017620422003  ');
    expect(off.callCount('3017620422003')).toBe(1);
    expect(catalog.cachedBarcodes).toBe(1);
  });

  it('NOT_FOUND: maps to notFound with the scanned code as the query', async () => {
    const { off, catalog } = setup();
    off.setNotFound('0000000000000');
    expect(await catalog.lookupByBarcode('0000000000000')).toEqual({
      kind: 'notFound',
      query: '0000000000000',
    });
  });

  it('NOT_FOUND_CACHE: a not-found barcode is cached too (N4: a definitive answer)', async () => {
    const { off, catalog } = setup();
    off.setNotFound('888');
    expect((await catalog.lookupByBarcode('888')).kind).toBe('notFound');
    expect((await catalog.lookupByBarcode('888')).kind).toBe('notFound');
    expect(off.callCount('888')).toBe(1);
  });

  it('OFF_5XX: maps to a catalogFailure (the calm failure line, not the not-found path)', async () => {
    const { off, catalog } = setup();
    off.setFailure('3017620422003', 'OFF HTTP 500');
    expect(await catalog.lookupByBarcode('3017620422003')).toMatchObject({
      kind: 'catalogFailure',
      reason: 'httpError',
    });
  });

  it('FOOD_GROUP: categories_tags classify the food into the right balance-arc bucket', async () => {
    const { off, catalog } = setup();
    off.setMatch('1', 'Apple Snack', ['en:fruits', 'en:apples']);
    off.setMatch('2', 'Yogurt', ['en:dairy', 'en:yogurts']);
    off.setMatch('3', 'Mystery Snack', []);
    expect(ranked(await catalog.lookupByBarcode('1'))[0]!.food.foodGroup).toBe('vegFruit');
    expect(ranked(await catalog.lookupByBarcode('2'))[0]!.food.foodGroup).toBe('dairy');
    expect(ranked(await catalog.lookupByBarcode('3'))[0]!.food.foodGroup).toBe('other');
  });

  it('N4: a transient failure is NOT cached: the next scan retries and can succeed; a match IS cached', async () => {
    const { off, catalog } = setup();
    off.setFailure('777', 'OFF HTTP 503');
    expect((await catalog.lookupByBarcode('777')).kind).toBe('catalogFailure');
    expect(off.callCount('777')).toBe(1);
    off.setMatch('777', 'Plain Yogurt', ['en:dairy']);
    expect((await catalog.lookupByBarcode('777')).kind).toBe('rankedMatches');
    expect(off.callCount('777')).toBe(2);
    await catalog.lookupByBarcode('777');
    expect(off.callCount('777')).toBe(2);
  });

  it('EMPTY_CODE: empty / whitespace short-circuits to notFound("") without hitting OFF', async () => {
    const { off, catalog } = setup();
    expect(await catalog.lookupByBarcode('')).toEqual({ kind: 'notFound', query: '' });
    expect(await catalog.lookupByBarcode('   ')).toEqual({ kind: 'notFound', query: '' });
    expect(off.totalCalls).toBe(0);
  });

  it('a source that throws is a typed catalogFailure, never a thrown error', async () => {
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      offSource: {
        lookup: async () => {
          throw new Error('adapter bug');
        },
      },
    });
    expect(await catalog.lookupByBarcode('1')).toMatchObject({
      kind: 'catalogFailure',
      reason: 'unknown',
    });
  });
});

describe('online lookup gate (privacy audit PV7)', () => {
  it('a denied gate sends NOTHING and reports not found (not cached)', async () => {
    const off = new FakeOffSource();
    off.setMatch('111', 'Jam', []);
    let allowed = false;
    const catalog = new OfflineFirstFoodCatalog({
      offSource: off,
      onlineLookupAllowed: async () => allowed,
    });
    expect((await catalog.lookupByBarcode('111')).kind).toBe('notFound');
    expect(off.totalCalls).toBe(0);
    expect(catalog.cachedBarcodes).toBe(0);
    allowed = true;
    expect((await catalog.lookupByBarcode('111')).kind).toBe('rankedMatches');
    expect(off.totalCalls).toBe(1);
  });

  it('there is no open default: a missing or non-true gate sends NOTHING', async () => {
    const off = new FakeOffSource();
    off.setMatch('111', 'Jam', []);
    // Untyped callers: no gate at all, and a gate that answers something other than `true`.
    const missing = new OfflineFirstFoodCatalog({ offSource: off } as unknown as {
      onlineLookupAllowed: () => Promise<boolean>;
    });
    expect((await missing.lookupByBarcode('111')).kind).toBe('notFound');
    for (const answer of [undefined, null, 'allowed', 1, 'true']) {
      const odd = new OfflineFirstFoodCatalog({
        offSource: off,
        onlineLookupAllowed: (async () => answer) as unknown as () => Promise<boolean>,
      });
      expect((await odd.lookupByBarcode('111')).kind, String(answer)).toBe('notFound');
    }
    expect(off.totalCalls).toBe(0);
  });

  it('a gate that throws fails closed', async () => {
    const off = new FakeOffSource();
    off.setMatch('111', 'Jam', []);
    const catalog = new OfflineFirstFoodCatalog({
      offSource: off,
      onlineLookupAllowed: async () => {
        throw new Error('locked');
      },
    });
    expect((await catalog.lookupByBarcode('111')).kind).toBe('notFound');
    expect(off.totalCalls).toBe(0);
  });

  it('the real source never gets a request while the gate is closed', async () => {
    const f = new FakeFetch();
    const catalog = new OfflineFirstFoodCatalog({
      offSource: createOffBarcodeSource({ fetchImpl: f.fetch }),
      onlineLookupAllowed: async () => false,
    });
    await catalog.lookupByBarcode('3017620422003');
    expect(f.requests).toHaveLength(0);
  });

  it('a cached barcode needs no gate; the offline search never asks', async () => {
    const off = new FakeOffSource();
    off.setMatch('111', 'Jam', []);
    let asked = 0;
    const catalog = new OfflineFirstFoodCatalog({
      offSource: off,
      onlineLookupAllowed: async () => {
        asked++;
        return true;
      },
    });
    await catalog.lookupByBarcode('111');
    await catalog.lookupByBarcode('111');
    await catalog.search('apple');
    expect(asked).toBe(1);
    expect(off.totalCalls).toBe(1);
  });
});

describe('two separate LRU caches (search 32, barcode 64)', () => {
  it('default capacities', () => {
    expect(new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow }).cacheCapacity).toBe(32);
  });

  it('the search cache holds 32 and evicts the oldest; the barcode cache is separate and holds 64', async () => {
    const off = new FakeOffSource();
    const catalog = new OfflineFirstFoodCatalog({ onlineLookupAllowed: allow, offSource: off });
    // 16 queries x 3 limits = 48 distinct cache keys, all matching something: only 32 are kept.
    const queries = [
      'a',
      'b',
      'c',
      'e',
      'i',
      'o',
      'u',
      'r',
      's',
      't',
      'n',
      'l',
      'm',
      'p',
      'h',
      'k',
    ];
    for (const q of queries) for (const limit of [1, 2, 3]) await catalog.search(q, { limit });
    expect(catalog.cachedQueries).toBe(32);

    for (let i = 0; i < 70; i++) {
      off.setMatch(`b${i}`, `Food ${i}`, []);
      await catalog.lookupByBarcode(`b${i}`);
    }
    expect(catalog.cachedBarcodes).toBe(64);
    expect(catalog.cachedQueries).toBe(32); // untouched by barcode traffic
    // b0..b5 were evicted: scanning b0 again calls the source again; b69 does not.
    await catalog.lookupByBarcode('b69');
    expect(off.callCount('b69')).toBe(1);
    await catalog.lookupByBarcode('b0');
    expect(off.callCount('b0')).toBe(2);
  });

  it('a barcode read promotes it, so it survives eviction', async () => {
    const off = new FakeOffSource();
    const catalog = new OfflineFirstFoodCatalog({
      onlineLookupAllowed: allow,
      offSource: off,
      barcodeCacheCapacity: 2,
    });
    off.setMatch('a', 'A', []);
    off.setMatch('b', 'B', []);
    off.setMatch('c', 'C', []);
    await catalog.lookupByBarcode('a');
    await catalog.lookupByBarcode('b');
    await catalog.lookupByBarcode('a'); // promote a; b is now the oldest
    await catalog.lookupByBarcode('c'); // evicts b
    await catalog.lookupByBarcode('a');
    expect(off.callCount('a')).toBe(1);
    await catalog.lookupByBarcode('b');
    expect(off.callCount('b')).toBe(2);
  });
});

describe('LruCache', () => {
  it('promotes on get, evicts on put past capacity', () => {
    const lru = new LruCache<string, number>(2);
    lru.put('a', 1);
    lru.put('b', 2);
    expect(lru.get('a')).toBe(1); // touch a so b becomes the oldest
    lru.put('c', 3); // b is the oldest -> evicted
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe(1);
    expect(lru.get('c')).toBe(3);
    expect(lru.length).toBe(2);
  });

  it('put promotes an existing key and replaces its value', () => {
    const lru = new LruCache<string, number>(2);
    lru.put('a', 1);
    lru.put('b', 2);
    lru.put('a', 10);
    expect(lru.keys()).toEqual(['b', 'a']);
    lru.put('c', 3);
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe(10);
  });

  it('a stored falsy value is still a hit', () => {
    const lru = new LruCache<string, number>(2);
    lru.put('zero', 0);
    expect(lru.get('zero')).toBe(0);
  });

  it('clear() drops every entry', () => {
    const lru = new LruCache<string, number>(4);
    lru.put('a', 1);
    lru.put('b', 2);
    lru.clear();
    expect(lru.length).toBe(0);
    expect(lru.get('a')).toBeUndefined();
  });

  it('the constructor rejects a capacity <= 0', () => {
    expect(() => new LruCache<string, number>(0)).toThrow(RangeError);
  });
});
