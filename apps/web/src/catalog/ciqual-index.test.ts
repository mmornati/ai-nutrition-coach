import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CiqualTable } from './ciqual';
import {
  CiqualIndex,
  ciqualDatabaseFood,
  ciqualName,
  CiqualParseError,
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
    // (Raw rice is ranked down on purpose, see the cooked-first tests: leave it out here.)
    const hits = index
      .search('riz', 60)
      .filter((h) => !/\bcru\b|\bsec\b/.test(h.entry.nameFr.toLowerCase()));
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

  it('tells an unreadable file (do not download it again) from a failed request', async () => {
    const bad = (fetchImpl: () => Promise<Response>) =>
      createCiqualFetchLoader({ baseUrl: '/', fetchImpl })();
    await expect(bad(async () => new Response('<html>'))).rejects.toBeInstanceOf(CiqualParseError);
    await expect(bad(async () => new Response('{"a":1}'))).rejects.toBeInstanceOf(CiqualParseError);
    await expect(bad(async () => new Response('x', { status: 503 }))).rejects.not.toBeInstanceOf(
      CiqualParseError,
    );
    expect(() => CiqualIndex.fromTable({ ...table, nutrients: ['x'] })).toThrow(CiqualParseError);
  });
});

describe('cooked first', () => {
  const isCooked = (name: string) => /\bcuit/i.test(name);
  const isRaw = (name: string) => /\b(cru|sec)\b/i.test(name);
  const top = (query: string, limit: number, locale: 'en' | 'fr' = 'fr') =>
    index.search(query, limit, { locale }).map((h) => h.entry);

  it('ranks the cooked rice rows above the raw ones for "riz"', () => {
    const rows = top('riz', 40).filter((e) => e.subgroupCode === '0301');
    const firstRaw = rows.findIndex((e) => isRaw(e.nameFr));
    const lastCooked = rows.map((e) => isCooked(e.nameFr)).lastIndexOf(true);
    expect(firstRaw).toBeGreaterThan(-1);
    expect(lastCooked).toBeGreaterThan(-1);
    expect(firstRaw).toBeGreaterThan(lastCooked);
  });

  it('puts cooked basmati first for "riz basmati"', () => {
    const [first, second] = top('riz basmati', 5);
    expect(first!.nameFr).toMatch(/basmati, cuit/i);
    expect(second!.nameFr).toMatch(/basmati/i);
  });

  it('puts cooked pasta, lentils and rice first, in either language', () => {
    expect(top('pâtes', 1)[0]!.nameFr).toMatch(/cuit/i);
    expect(top('lentilles', 1)[0]!.nameFr).toMatch(/cuit/i);
    expect(top('rice', 1, 'en')[0]!.nameEn).toMatch(/cooked/i);
    expect(top('lentils', 1, 'en')[0]!.nameEn).toMatch(/cooked|boiled/i);
  });

  it('keeps raw and dry first when the query asks for them', () => {
    expect(top('riz cru', 1)[0]!.nameFr).toMatch(/\bcru\b/i);
    expect(top('lentilles sèches', 1)[0]!.nameFr).toMatch(/sèche|\bsec\b/i);
    expect(top('rice raw', 1, 'en')[0]!.nameEn).toMatch(/\braw\b/i);
  });

  it('does not reorder foods outside tubers, pulses and grains', () => {
    const meat = top('poulet', 10);
    const bias = index.search('poulet', 10).map((h) => h.score);
    expect(bias).toEqual([...bias].sort((a, b) => b - a));
    expect(meat.length).toBeGreaterThan(0);
  });
});
