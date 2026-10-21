import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CiqualTable } from './ciqual';
import {
  CiqualIndex,
  ciqualDatabaseFood,
  ciqualName,
  createCiqualFetchLoader,
  indexTokens,
} from './ciqual-index';

const table = JSON.parse(
  readFileSync(join(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
) as CiqualTable;
const index = CiqualIndex.fromTable(table);

const names = (query: string, limit = 5): string[] =>
  index.search(query, limit).map((h) => h.entry.nameFr);

describe('indexTokens', () => {
  it('folds accents and ligatures, drops glue words, stems plurals', () => {
    expect(indexTokens('Œufs durs, à la coque')).toEqual(['oeuf', 'dur', 'coque']);
    expect(indexTokens('Épinards')).toEqual(['epinard']);
    expect(indexTokens('pâtes')).toEqual(['pates']); // not folded onto pâté
    expect(indexTokens('Riz blanc, cuit, sans sel ajouté')).toEqual([
      'riz',
      'blanc',
      'cuit',
      'sans',
      'sel',
      'ajoute',
    ]);
  });
});

describe('the index', () => {
  it('leaves out rows with neither energy nor protein', () => {
    const useless = table.foods.filter((f) => f[5] === null && f[6] === null).length;
    expect(useless).toBeGreaterThan(0);
    expect(index.size).toBe(table.foods.length - useless);
  });

  it('finds a food by code, with its nutrients', () => {
    expect(index.byCode('9104')?.nutrients.energyKcal).toBe(155);
    expect(index.byCode('nope')).toBeUndefined();
  });
});

describe('search', () => {
  it('ignores case and accents', () => {
    expect(names('EPINARD')).toEqual(names('épinard'));
    expect(names('epinards')[0]).toMatch(/^Épinard/);
    expect(names('oeufs').length).toBeGreaterThan(0);
    expect(names('oeufs')[0]).toMatch(/^Oeuf/);
  });

  it('matches either language, whatever the UI language', () => {
    expect(names('milk', 20).some((n) => /^Lait/.test(n))).toBe(true);
    expect(names('lait', 20).some((n) => /^Lait/.test(n))).toBe(true);
    expect(index.byCode('9104')?.nameEn).toMatch(/rice/i);
    expect(names('rice cooked')).toContain('Riz blanc, cuit, sans sel ajouté');
  });

  it('needs every word, and a prefix counts while typing', () => {
    expect(names('riz xyzzy')).toEqual([]);
    expect(names('pomm', 30).some((n) => /^Pomme/.test(n))).toBe(true);
    const both = names('riz cuit', 10);
    expect(both.length).toBeGreaterThan(0);
    for (const n of both) expect(n.toLowerCase()).toMatch(/riz.*cuit|cuit.*riz/);
  });

  it('puts the short, generic food whose name starts with the word first', () => {
    const top = names('riz', 3);
    expect(top[0]).toMatch(/^Riz/);
    // "Pain au riz" style names (head word elsewhere) rank after names that start with it.
    const hits = index.search('riz', 30);
    const firstElsewhere = hits.findIndex((h) => !h.entry.nameFr.toLowerCase().startsWith('riz'));
    const lastStarting = hits
      .map((h) => h.entry.nameFr.toLowerCase().startsWith('riz'))
      .lastIndexOf(true);
    if (firstElsewhere !== -1) expect(firstElsewhere).toBeGreaterThan(lastStarting);
    // Fewer words wins a tie on the head word.
    expect(hits[0]!.entry.frTokens.length).toBeLessThanOrEqual(hits[1]!.entry.frTokens.length);
  });

  it('is deterministic and capped', () => {
    expect(names('pomme', 4)).toHaveLength(4);
    expect(names('pomme', 4)).toEqual(names('pomme', 4));
    expect(index.search('pomme', 0)).toEqual([]);
    expect(index.search('   ', 5)).toEqual([]);
    expect(index.search('de la', 5)).toEqual([]); // only glue words
  });

  it('can leave out codes (a seed already stands for them)', () => {
    const all = index.search('riz', 5).map((h) => h.entry.code);
    const without = index
      .search('riz', 5, { exclude: new Set([all[0]!]) })
      .map((h) => h.entry.code);
    expect(without).not.toContain(all[0]);
  });

  it('stays fast (generous bound; typically about a millisecond)', () => {
    const queries = [
      'pomme',
      'riz cuit',
      'poulet rôti',
      'fromage',
      'yaourt nature',
      'a',
      'chocolat noir',
    ];
    index.search('warm up', 5);
    const start = performance.now();
    const rounds = 20;
    for (let i = 0; i < rounds; i++) for (const q of queries) index.search(q, 10);
    const perQuery = (performance.now() - start) / (rounds * queries.length);
    expect(perQuery).toBeLessThan(25);
  });
});

describe('names and foods', () => {
  const entry = index.byCode('9104')!;
  it('names by UI language, falling back to the other one', () => {
    expect(ciqualName(entry, 'fr')).toBe('Riz blanc, cuit, sans sel ajouté');
    expect(ciqualName(entry, 'en')).toBe(entry.nameEn);
    expect(ciqualName({ ...entry, nameEn: ' ' }, 'en')).toBe(entry.nameFr);
  });

  it('makes a stable ciqual:<code> food with nutrients and a group', () => {
    const food = ciqualDatabaseFood(index, entry, 'fr');
    expect(food).toMatchObject({
      sourceRef: 'ciqual:9104',
      source: 'ciqual',
      foodGroup: 'starch',
      displayName: 'Riz blanc, cuit, sans sel ajouté',
    });
    expect(food.nutrientsPer100g?.energyKcal).toBe(155);
  });
});

describe('createCiqualFetchLoader', () => {
  const tiny = { foods: [], version: '1' };
  it('reads the table from <base>catalog/ciqual-2025.json (same origin, so the precache serves it)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(tiny)));
    const load = createCiqualFetchLoader({ baseUrl: '/app/', fetchImpl });
    expect(await load()).toEqual(tiny);
    expect(fetchImpl).toHaveBeenCalledWith('/app/catalog/ciqual-2025.json');
  });

  it('rejects on an HTTP error, a network error and a wrong body', async () => {
    const bad = (fetchImpl: () => Promise<Response>) =>
      createCiqualFetchLoader({ baseUrl: '/', fetchImpl })();
    await expect(bad(async () => new Response('x', { status: 404 }))).rejects.toThrow(/404/);
    await expect(
      bad(async () => {
        throw new TypeError('offline');
      }),
    ).rejects.toThrow();
    await expect(bad(async () => new Response('{"a":1}'))).rejects.toThrow(/expected/);
  });
});
