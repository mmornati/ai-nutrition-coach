/**
 * The searchable CIQUAL table: loader, token index and ranking.
 *
 * LOADING. The table (`public/catalog/ciqual-2025.json`, ~500 kB, precached by the service worker) is
 * fetched from the app's own origin, once, on the first search, by an injectable {@link CiqualLoader}
 * (tests pass their own; nothing leaves the device and no new host is involved). A failed load is
 * not fatal: the catalog keeps answering with the curated foods alone (which carry their own
 * nutrients) and retries later with a growing delay. A file that arrives but cannot be parsed is not
 * downloaded again after the second attempt in a session. This request is the one fetch the
 * search path makes, to the app's own origin only (docs/telemetry-posture.md).
 *
 * INDEX. Built once per table: for each food the French and English names are folded (lower-case, no
 * accents, `oe` ligatures spelled out), split into tokens, lightly stemmed (a trailing plural
 * `s` / `x`) and stripped of French / English glue words ("de", "au", "et"...; "sans" / "without"
 * stay, they change the meaning). Foods with neither energy nor protein are
 * left out: a row with no number to show (25 of 3,484, mostly generic placeholders) cannot feed a
 * nutrient bar and would only add noise to the results.
 *
 * SEARCH. A name matches when EVERY query token matches one of its tokens: exactly (1.0) or as a
 * prefix (0.7, so "past" finds "pasta" while typing). The score blends the mean token score (0.35),
 * a bonus when the name STARTS with the first query word (0.25; CIQUAL puts the main noun first:
 * "Riz blanc, cuit...") and specificity, the share of the name the query covers (0.4), so the short
 * generic "Pain blanc" outranks "Pain au chocolat et aux amandes" for "pain"; CIQUAL's generic
 * "(aliment moyen)" row gets a small extra. Either language's name may match, whatever the UI
 * language (the other language counts x0.85); the display name follows the UI language. Ties: fewer name tokens, then code. A linear scan over ~3.4k entries with precomputed
 * tokens; typical queries take about a millisecond (see the benchmark test).
 */
import type { DatabaseFood, FoodGroup, Nutrients } from '@anc/core';
import { databaseFood } from '@anc/core';
import type { Locale } from '../i18n/locale';
import { CIQUAL_FILE, ciqualFoods, type CiqualFood, type CiqualTable } from './ciqual';
import { ciqualFoodGroup } from './ciqual-groups';
import { foldText } from './fold';

/** Supplies the table. Rejects when it cannot (offline and not precached, bad file). */
export type CiqualLoader = () => Promise<CiqualTable>;

/** The file arrived but is not a usable table: downloading it again will not help. */
export class CiqualParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CiqualParseError';
  }
}

export const CIQUAL_SOURCE_PREFIX = 'ciqual:';

type FetchFn = (input: string) => Promise<Response>;

/**
 * Loads the table from the app's own origin: `<BASE_URL>catalog/ciqual-2025.json`. The service
 * worker answers from the precache when offline.
 */
export function createCiqualFetchLoader(
  options: { readonly baseUrl?: string; readonly fetchImpl?: FetchFn } = {},
): CiqualLoader {
  return async () => {
    const base = options.baseUrl ?? import.meta.env.BASE_URL;
    const doFetch: FetchFn = options.fetchImpl ?? ((url) => globalThis.fetch(url));
    const response = await doFetch(`${base}catalog/${CIQUAL_FILE}`);
    if (!response.ok) throw new Error(`CIQUAL table HTTP ${response.status}`);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CiqualParseError('CIQUAL table is not valid JSON');
    }
    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as { foods?: unknown }).foods)
    ) {
      throw new CiqualParseError('CIQUAL table is not the expected JSON');
    }
    return body as CiqualTable;
  };
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'au',
  'aux',
  'et',
  'ou',
  'en',
  'un',
  'une',
  'a',
  'd',
  'l',
  'the',
  'of',
  'and',
  'with',
  'or',
  'in',
  'to',
]);

/** Words whose plural-looking end is part of the word (pâtes vs pâté), kept as typed. */
const KEEP_FORM: ReadonlySet<string> = new Set([
  'pates',
  'pois',
  'mais',
  'riz',
  'noix',
  'bas',
  'sans',
  'plus',
]);

function stem(token: string): string {
  if (token.length <= 3 || KEEP_FORM.has(token)) return token;
  return token.endsWith('s') || token.endsWith('x') ? token.slice(0, -1) : token;
}

/** Folded, stemmed, stop-word-free tokens of a name or query. */
export function indexTokens(raw: string): string[] {
  const out: string[] = [];
  for (const t of foldText(raw).split(/[^a-z0-9]+/)) {
    if (t.length > 0 && !STOP_WORDS.has(t)) out.push(stem(t));
  }
  return out;
}

export interface CiqualEntry {
  readonly code: string;
  readonly nameFr: string;
  readonly nameEn: string;
  readonly groupCode: string;
  readonly subgroupCode: string | undefined;
  readonly nutrients: Nutrients;
  /** @internal */ readonly frTokens: readonly string[];
  /** @internal */ readonly enTokens: readonly string[];
}

export interface CiqualHit {
  readonly entry: CiqualEntry;
  /** 0..1, higher is a better match. */
  readonly score: number;
}

const MAX_QUERY_TOKENS = 8;
const MAX_QUERY_LENGTH = 100;

/** Score of `query` tokens against `name` tokens: 0 when any query token has no match. */
function scoreName(query: readonly string[], name: readonly string[]): number {
  if (name.length === 0) return 0;
  let total = 0;
  let head = 0;
  for (const [i, q] of query.entries()) {
    let best = 0;
    for (const [j, n] of name.entries()) {
      const s = n === q ? 1 : n.startsWith(q) ? 0.7 : 0;
      if (s > best) best = s;
      if (i === 0 && j === 0 && s > 0) head = 1;
    }
    if (best === 0) return 0;
    total += best;
  }
  const mean = total / query.length;
  const specificity = Math.min(1, query.length / name.length);
  // "(aliment moyen)" / "(average)" marks CIQUAL's generic row of a food: the one to offer first.
  const generic = name.includes('moyen') || name.includes('average') ? 0.06 : 0;
  return Math.min(1, 0.35 * mean + 0.25 * head + 0.4 * specificity + generic);
}

/** Sub-groups of tubers, pulses and pasta / rice / grains, where raw and cooked rows both exist. */
const COOKABLE_SUBGROUPS: ReadonlySet<string> = new Set(['0202', '0203', '0301']);
const COOKED_WORDS: ReadonlySet<string> = new Set(['cuit', 'cooked', 'boiled', 'bouilli']);
const RAW_WORDS: ReadonlySet<string> = new Set(['cru', 'raw', 'sec', 'seche', 'dry', 'dried']);
/** How much a cooked row gains (a raw or dry one loses) when the query does not say "raw" / "dry". */
const COOKED_BIAS = 0.15;

/**
 * "riz" means the cooked rice on the plate, not the dry grain in the bag: for tubers, pulses, pasta,
 * rice and grains, cooked rows rank above raw / dry ones unless the query itself says "cru", "raw",
 * "sec" or "dry".
 */
function cookedBias(entry: CiqualEntry, queryWantsRaw: boolean): number {
  if (queryWantsRaw || entry.subgroupCode === undefined) return 0;
  if (!COOKABLE_SUBGROUPS.has(entry.subgroupCode)) return 0;
  const tokens = [...entry.frTokens, ...entry.enTokens];
  if (tokens.some((t) => RAW_WORDS.has(t))) return -COOKED_BIAS;
  if (tokens.some((t) => COOKED_WORDS.has(t))) return COOKED_BIAS;
  return 0;
}

/** A match through the name in the other language than the UI's counts a little less. */
const OTHER_LANGUAGE = 0.85;

export class CiqualIndex {
  private readonly entries: readonly CiqualEntry[];
  private readonly byCodeMap: ReadonlyMap<string, CiqualEntry>;
  private readonly groups = new Map<string, FoodGroup>();

  private constructor(entries: readonly CiqualEntry[]) {
    this.entries = entries;
    this.byCodeMap = new Map(entries.map((e) => [e.code, e]));
  }

  /** Builds the index; throws a {@link CiqualParseError} when the table has the wrong shape. */
  static fromTable(table: CiqualTable): CiqualIndex {
    const entries: CiqualEntry[] = [];
    let foods: ReturnType<typeof ciqualFoods>;
    try {
      foods = ciqualFoods(table);
    } catch (e) {
      throw new CiqualParseError(e instanceof Error ? e.message : 'bad CIQUAL table');
    }
    for (const food of foods) {
      if (!isUseful(food)) continue;
      entries.push({
        code: food.code,
        nameFr: food.nameFr,
        nameEn: food.nameEn,
        groupCode: food.groupCode,
        subgroupCode: food.subgroupCode,
        nutrients: food.per100g,
        frTokens: indexTokens(food.nameFr),
        enTokens: indexTokens(food.nameEn),
      });
    }
    return new CiqualIndex(entries);
  }

  get size(): number {
    return this.entries.length;
  }

  byCode(code: string): CiqualEntry | undefined {
    return this.byCodeMap.get(code);
  }

  /** The best `limit` matches for `query`, best first. Empty for a blank query. */
  search(
    query: string,
    limit: number,
    options: { readonly exclude?: ReadonlySet<string>; readonly locale?: Locale } = {},
  ): CiqualHit[] {
    const { exclude, locale = 'en' } = options;
    const tokens = indexTokens(query.slice(0, MAX_QUERY_LENGTH)).slice(0, MAX_QUERY_TOKENS);
    if (tokens.length === 0 || limit <= 0) return [];
    const hits: CiqualHit[] = [];
    const queryWantsRaw = tokens.some((t) => RAW_WORDS.has(t) || COOKED_WORDS.has(t));
    for (const entry of this.entries) {
      if (exclude?.has(entry.code)) continue;
      const fr = scoreName(tokens, entry.frTokens);
      const en = scoreName(tokens, entry.enTokens);
      const base =
        locale === 'fr' ? Math.max(fr, en * OTHER_LANGUAGE) : Math.max(en, fr * OTHER_LANGUAGE);
      if (base > 0) {
        const score = Math.min(1, Math.max(0.01, base + cookedBias(entry, queryWantsRaw)));
        hits.push({ entry, score });
      }
    }
    hits.sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.frTokens.length - b.entry.frTokens.length ||
        (a.entry.code < b.entry.code ? -1 : a.entry.code > b.entry.code ? 1 : 0),
    );
    return hits.slice(0, limit);
  }

  /** The app's food group for an entry (memoised; name-based rules cost a classification). */
  groupOf(entry: CiqualEntry): FoodGroup {
    let group = this.groups.get(entry.code);
    if (group === undefined) {
      group = ciqualFoodGroup({
        groupCode: entry.groupCode,
        ...(entry.subgroupCode !== undefined ? { subgroupCode: entry.subgroupCode } : {}),
        nameFr: entry.nameFr,
      });
      this.groups.set(entry.code, group);
    }
    return group;
  }
}

/** A row with at least an energy or a protein value; the rest has nothing to show. */
function isUseful(food: CiqualFood): boolean {
  return food.per100g.energyKcal !== undefined || food.per100g.protein !== undefined;
}

/** The entry's name in `locale`, falling back to the other language when empty. */
export function ciqualName(entry: CiqualEntry, locale: Locale): string {
  const primary = locale === 'fr' ? entry.nameFr : entry.nameEn;
  const other = locale === 'fr' ? entry.nameEn : entry.nameFr;
  return primary.trim().length > 0 ? primary : other;
}

/** The `DatabaseFood` a CIQUAL entry logs as (`ciqual:<code>`, stable across releases of the app). */
export function ciqualDatabaseFood(
  index: CiqualIndex,
  entry: CiqualEntry,
  locale: Locale,
): DatabaseFood {
  return databaseFood({
    sourceRef: `${CIQUAL_SOURCE_PREFIX}${entry.code}`,
    displayName: ciqualName(entry, locale),
    source: 'ciqual',
    foodGroup: index.groupOf(entry),
    nutrientsPer100g: entry.nutrients,
  });
}
