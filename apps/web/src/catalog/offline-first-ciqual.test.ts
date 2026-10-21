import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogResult } from '@anc/core';
import type { CiqualTable } from './ciqual';
import { CiqualParseError } from './ciqual-index';
import { OfflineFirstFoodCatalog } from './offline-first-catalog';
import type { OffBarcodeSource } from './off-barcode-source';

const table = JSON.parse(
  readFileSync(join(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
) as CiqualTable;
const loader = () => Promise.resolve(table);
const make = (extra: object = {}, locale: 'en' | 'fr' = 'fr') =>
  new OfflineFirstFoodCatalog({
    onlineLookupAllowed: async () => true,
    locale: () => locale,
    ciqual: loader,
    ...extra,
  });
const matches = (r: CatalogResult) => {
  if (r.kind !== 'rankedMatches') throw new Error(r.kind);
  return r.matches;
};

describe('catalog search with CIQUAL', () => {
  it('lists the curated food first, with nutrients and gram presets, then CIQUAL foods', async () => {
    const m = matches(await make().search('riz'));
    expect(m[0]!.food).toMatchObject({ source: 'seed', sourceRef: 'seed:rice' });
    expect(m[0]!.food.nutrientsPer100g?.energyKcal).toBe(155);
    expect(m[0]!.presets.map((q) => q.grams)).toEqual([150, 300]);
    const rest = m.slice(1);
    expect(rest.length).toBeGreaterThan(0);
    for (const x of rest) {
      expect(x.food.source).toBe('ciqual');
      expect(x.food.sourceRef).toMatch(/^ciqual:\d+$/);
      expect(x.confidence).toBeLessThan(1);
      expect(x.presets.at(-1)).toMatchObject({ grams: 100 });
    }
    // The seed's own CIQUAL food is not listed a second time.
    expect(rest.some((x) => x.food.sourceRef === 'ciqual:9104')).toBe(false);
  });

  it('names by UI language and finds across both', async () => {
    const fr = matches(await make({}, 'fr').search('milk', { limit: 30 }));
    const en = matches(await make({}, 'en').search('lait', { limit: 30 }));
    expect(fr.some((x) => x.food.source === 'ciqual' && /^Lait/.test(x.food.displayName))).toBe(
      true,
    );
    expect(en.some((x) => x.food.source === 'ciqual' && !/^Lait/.test(x.food.displayName))).toBe(
      true,
    );
  });

  it('respects the limit and a miss is notFound', async () => {
    expect(matches(await make().search('pomme', { limit: 4 }))).toHaveLength(4);
    expect((await make().search('zzzzqq')).kind).toBe('notFound');
  });

  it('works without a table (seeds only) and retries after a failed load', async () => {
    const none = new OfflineFirstFoodCatalog({ onlineLookupAllowed: async () => true });
    // The seeds carry their own nutrients: no table needed.
    expect(matches(await none.search('rice'))[0]!.food.nutrientsPer100g?.energyKcal).toBe(155);

    const load = vi
      .fn<() => Promise<CiqualTable>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(table);
    const c = make({ ciqual: load, ciqualRetryMs: 0 });
    const first = matches(await c.search('rice'));
    expect(first.every((x) => x.food.source === 'seed')).toBe(true);
    expect(c.cachedQueries).toBe(0); // not remembered: the next search gets the full list
    const second = matches(await c.search('rice'));
    expect(second.some((x) => x.food.source === 'ciqual')).toBe(true);
    expect(second[0]!.food.nutrientsPer100g).toBeDefined();
    expect(c.cachedQueries).toBe(1);
  });

  it('loads the table once, however many searches', async () => {
    const load = vi.fn(loader);
    const c = make({ ciqual: load });
    await Promise.all([c.search('riz'), c.search('pain'), c.search('lait')]);
    await c.search('oeuf');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('resolves seed and ciqual references', async () => {
    const c = make();
    expect((await c.lookupBySourceRef('seed:rice'))?.nutrientsPer100g?.protein).toBe(3.15);
    const food = await c.lookupBySourceRef('ciqual:9104');
    expect(food).toMatchObject({ source: 'ciqual', foodGroup: 'starch' });
    expect(await c.lookupBySourceRef('ciqual:0000000')).toBeNull();
  });
});

describe('barcode matches with nutrition', () => {
  const off = (result: Awaited<ReturnType<OffBarcodeSource['lookup']>>): OffBarcodeSource => ({
    lookup: async () => result,
  });

  it('carries nutrients, Nutri-Score / NOVA and serving / pack presets', async () => {
    const c = make({
      offSource: off({
        kind: 'match',
        barcode: '1',
        displayName: 'Yaourt',
        categoryTags: ['en:yogurts'],
        nutrientsPer100g: { energyKcal: 60, protein: 4 },
        extra: { nutriscoreGrade: 'b', novaGroup: 3 },
        servingGrams: 125,
        packGrams: 500,
      }),
    });
    const [m] = matches(await c.lookupByBarcode('1'));
    expect(m!.food.nutrientsPer100g).toEqual({ energyKcal: 60, protein: 4 });
    expect(m!.food.extra).toEqual({ nutriscoreGrade: 'b', novaGroup: 3 });
    expect(m!.presets.map((q) => q.grams)).toEqual([125, 100, 500]);
  });

  it('an old-shaped result (no new fields) still resolves, with only "100 g"', async () => {
    const c = make({
      offSource: off({ kind: 'match', barcode: '1', displayName: 'Jam', categoryTags: [] }),
    });
    const [m] = matches(await c.lookupByBarcode('1'));
    expect(m!.food.nutrientsPer100g).toBeUndefined();
    expect(m!.presets.map((q) => q.grams)).toEqual([100]);
  });
});

describe('seeds, ranking and a slow or failing table', () => {
  it('a seed is listed only when ALL the query words match it', async () => {
    const m = matches(await make().search('riz basmati', { limit: 20 }));
    expect(m.some((x) => x.food.source === 'seed')).toBe(false);
    expect(m[0]!.food.sourceRef).toBe('ciqual:9125'); // cooked basmati
    const en = matches(await make({}, 'en').search('rice basmati', { limit: 20 }));
    expect(en.some((x) => x.food.source === 'seed')).toBe(false);
    // A single word and a complete name still find the seed.
    expect(matches(await make().search('riz'))[0]!.food.sourceRef).toBe('seed:rice');
    expect(matches(await make({}, 'en').search('sweet potato'))[0]!.food.sourceRef).toBe(
      'seed:sweet potato',
    );
  });

  it('lists cooked foods first for "pâtes", "lentilles" and "rice"', async () => {
    const fr = make();
    for (const q of ['pâtes', 'lentilles']) {
      const m = matches(await fr.search(q, { limit: 12 })).filter(
        (x) => x.food.source === 'ciqual',
      );
      expect(m[0]!.food.displayName, q).toMatch(/cuit/i);
    }
    const en = matches(await make({}, 'en').search('rice', { limit: 12 })).filter(
      (x) => x.food.source === 'ciqual',
    );
    expect(en[0]!.food.displayName).toMatch(/cooked/i);
    // The same query asking for raw keeps the raw one on top.
    const raw = matches(await make().search('riz cru', { limit: 5 }));
    expect(raw[0]!.food.displayName).toMatch(/cru/i);
  });

  it('answers with the seeds when the table is slow, and the load carries on', async () => {
    let release: (t: CiqualTable) => void = () => undefined;
    const load = vi.fn(() => new Promise<CiqualTable>((resolve) => (release = resolve)));
    const c = make({ ciqual: load, ciqualWaitMs: 20 });
    const first = matches(await c.search('riz'));
    expect(first.every((x) => x.food.source === 'seed')).toBe(true);
    expect(first[0]!.food.nutrientsPer100g?.energyKcal).toBe(155);
    expect(c.cachedQueries).toBe(0);
    release(table);
    await vi.waitFor(async () => {
      const second = matches(await c.search('riz'));
      expect(second.some((x) => x.food.source === 'ciqual')).toBe(true);
    });
    expect(load).toHaveBeenCalledTimes(1); // the slow load was kept, not restarted
  });

  describe('retries', () => {
    const failing = () => vi.fn<() => Promise<CiqualTable>>().mockRejectedValue(new Error('off'));

    it('wait 30 s, 60 s, 120 s ... and stop growing at 10 minutes', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(0);
        const load = failing();
        const c = make({ ciqual: load });
        const attempt = async () => {
          await c.search('riz');
        };
        await attempt();
        expect(load).toHaveBeenCalledTimes(1);
        vi.setSystemTime(29_000);
        await attempt();
        expect(load).toHaveBeenCalledTimes(1);
        vi.setSystemTime(30_000);
        await attempt();
        expect(load).toHaveBeenCalledTimes(2); // failed twice: next wait is 60 s
        vi.setSystemTime(30_000 + 59_000);
        await attempt();
        expect(load).toHaveBeenCalledTimes(2);
        vi.setSystemTime(30_000 + 60_000);
        await attempt();
        expect(load).toHaveBeenCalledTimes(3); // next wait 120 s
        // Many failures later the wait is capped.
        let t = 90_000;
        for (let i = 0; i < 6; i++) {
          t += 600_000;
          vi.setSystemTime(t);
          await attempt();
        }
        const calls = load.mock.calls.length;
        vi.setSystemTime(t + 599_000);
        await attempt();
        expect(load).toHaveBeenCalledTimes(calls);
        vi.setSystemTime(t + 600_000);
        await attempt();
        expect(load).toHaveBeenCalledTimes(calls + 1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a table that arrives unreadable is fetched once more, then never again', async () => {
      const load = vi
        .fn<() => Promise<CiqualTable>>()
        .mockRejectedValue(new CiqualParseError('bad'));
      const c = make({ ciqual: load, ciqualRetryMs: 0 });
      for (let i = 0; i < 5; i++) await c.search('riz');
      expect(load).toHaveBeenCalledTimes(2);
      // The seeds still answer, with their own nutrients.
      expect(matches(await c.search('riz'))[0]!.food.nutrientsPer100g?.protein).toBe(3.15);
    });

    it('a table whose content cannot be indexed counts as unreadable too', async () => {
      const load = vi.fn(async () => ({ ...table, nutrients: ['x'] }) as CiqualTable);
      const c = make({ ciqual: load, ciqualRetryMs: 0 });
      for (let i = 0; i < 4; i++) await c.search('riz');
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('a plain network failure keeps being retried, and a success resets the wait', async () => {
      const load = vi
        .fn<() => Promise<CiqualTable>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(table);
      const c = make({ ciqual: load, ciqualRetryMs: 0 });
      for (let i = 0; i < 4; i++) await c.search('riz');
      expect(load).toHaveBeenCalledTimes(3);
    });
  });
});
